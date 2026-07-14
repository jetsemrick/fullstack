import type { PricePoint } from "@stock/shared";

export interface BacktestResult {
  entryTimestamp: number;
  entryClose: number;
  latestTimestamp: number;
  latestClose: number;
  volume: number;
  costBasis: number;
  marketValue: number;
  profitLoss: number;
  profitLossPercent: number;
}

export type BacktestCalculation =
  | { ok: true; result: BacktestResult }
  | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseTradeDate(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;

  const parsedDate = new Date(timestamp);
  return parsedDate.toISOString().slice(0, 10) === value ? timestamp : null;
}

export function getSessionDate(timestamp: number, exchangeTimezoneName: string | null): string {
  const date = new Date(timestamp * 1000);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: exchangeTimezoneName ?? "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) {
      return `${values.year}-${values.month}-${values.day}`;
    }
  } catch {
    // Fall back to UTC if upstream supplies an invalid IANA timezone.
  }
  return date.toISOString().slice(0, 10);
}

export function calculateBacktest(
  series: PricePoint[],
  volume: number,
  tradeDate: string,
  exchangeTimezoneName: string | null = null,
): BacktestCalculation {
  const tradeDateMs = parseTradeDate(tradeDate);
  if (tradeDateMs == null) {
    return { ok: false, error: "Enter a valid trade date." };
  }
  if (!Number.isFinite(volume) || volume <= 0) {
    return { ok: false, error: "Share volume must be greater than zero." };
  }

  const usableSeries = series
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close) && point.close > 0)
    .toSorted((a, b) => a.timestamp - b.timestamp);

  if (usableSeries.length === 0) {
    return { ok: false, error: "No daily price history is available for this ticker." };
  }

  const entry = usableSeries.find(
    (point) => getSessionDate(point.timestamp, exchangeTimezoneName) >= tradeDate,
  );
  if (!entry) {
    return { ok: false, error: "No trading session is available on or after this date." };
  }

  const latest = usableSeries[usableSeries.length - 1];
  const costBasis = entry.close * volume;
  const marketValue = latest.close * volume;
  const profitLoss = marketValue - costBasis;
  const profitLossPercent = (profitLoss / costBasis) * 100;
  if (![costBasis, marketValue, profitLoss, profitLossPercent].every(Number.isFinite)) {
    return { ok: false, error: "Share volume is too large." };
  }

  return {
    ok: true,
    result: {
      entryTimestamp: entry.timestamp,
      entryClose: entry.close,
      latestTimestamp: latest.timestamp,
      latestClose: latest.close,
      volume,
      costBasis,
      marketValue,
      profitLoss,
      profitLossPercent,
    },
  };
}
