import type { GetPricesResponse, PricePoint } from "@stock/shared";

export const MAX_COMPARE_TICKERS = 5;

/** Indexed baseline: first close in the visible series = 100. */
export const COMPARE_INDEX_BASE = 100;

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export type CompareSeries = {
  ticker: string;
  data: GetPricesResponse;
  color: string;
};

/** Recharts row: shared timestamp plus per-ticker indexed values (or null gaps). */
export type CompareChartRow = {
  t: number;
} & Record<string, number | null>;

export const COMPARE_COLORS = [
  "#f54e00",
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
] as const;

export function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function addTickerToList(
  current: readonly string[],
  raw: string,
): { tickers: string[]; error?: string } {
  const ticker = normalizeTickerInput(raw);
  if (!ticker) return { tickers: [...current], error: "Enter a ticker symbol" };
  if (current.includes(ticker)) {
    return { tickers: [...current], error: `${ticker} is already on the chart` };
  }
  if (current.length >= MAX_COMPARE_TICKERS) {
    return {
      tickers: [...current],
      error: `You can compare up to ${MAX_COMPARE_TICKERS} tickers`,
    };
  }
  return { tickers: [...current, ticker] };
}

export function removeTickerFromList(current: readonly string[], raw: string): string[] {
  const ticker = normalizeTickerInput(raw);
  return current.filter((t) => t !== ticker);
}

export function colorForCompareIndex(index: number): string {
  return COMPARE_COLORS[index % COMPARE_COLORS.length] ?? COMPARE_COLORS[0];
}

export function seriesHasVolume(series: PricePoint[]): boolean {
  return series.some((p) => p.volume != null);
}

export function buildPriceVolumeRows(data: GetPricesResponse): PriceVolumeRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    volume: p.volume,
    volumeBar: p.volume ?? 0,
  }));
}

export function formatVolumeAxis(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatVolumeTooltip(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function filterSeriesByHorizon(
  data: GetPricesResponse,
  horizonDays: number,
): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export function indexedValueFromStart(close: number, baseClose: number): number | null {
  if (!Number.isFinite(close) || !Number.isFinite(baseClose) || baseClose === 0) {
    return null;
  }
  return (close / baseClose) * COMPARE_INDEX_BASE;
}

export function formatCompareAxisValue(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export function formatCompareTooltipValue(value: number): string {
  const delta = value - COMPARE_INDEX_BASE;
  const sign = delta > 0 ? "+" : "";
  const pct = `${sign}${delta.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
  return `${formatCompareAxisValue(value)} (${pct} vs start)`;
}

export function resolveCompareColor(
  ticker: string,
  index: number,
  colorsByTicker: Readonly<Record<string, string>> = {},
): string {
  return colorsByTicker[ticker] ?? colorForCompareIndex(index);
}

export function buildCompareSeries(
  inputs: Array<{ ticker: string; data: GetPricesResponse }>,
  colorsByTicker: Readonly<Record<string, string>> = {},
): CompareSeries[] {
  return inputs.map((entry, index) => ({
    ticker: entry.ticker,
    data: entry.data,
    color: resolveCompareColor(entry.ticker, index, colorsByTicker),
  }));
}

/**
 * Align multiple series on a shared time index (union of timestamps).
 * Values are indexed to 100 at each series' first point in the supplied data.
 */
export function buildCompareChartRows(
  seriesList: Array<{ ticker: string; data: GetPricesResponse }>,
): CompareChartRow[] {
  if (seriesList.length === 0) return [];

  const timestampSet = new Set<number>();
  const valuesByTicker = new Map<string, Map<number, number>>();

  for (const { ticker, data } of seriesList) {
    const baseClose = data.series[0]?.close;
    if (baseClose == null || !Number.isFinite(baseClose) || baseClose === 0) continue;

    const pointMap = new Map<number, number>();
    for (const p of data.series) {
      const tMs = p.timestamp * 1000;
      const indexed = indexedValueFromStart(p.close, baseClose);
      if (indexed == null) continue;
      timestampSet.add(tMs);
      pointMap.set(tMs, indexed);
    }
    valuesByTicker.set(ticker, pointMap);
  }

  const timestamps = [...timestampSet].sort((a, b) => a - b);
  return timestamps.map((t) => {
    const row: CompareChartRow = { t };
    for (const { ticker } of seriesList) {
      const map = valuesByTicker.get(ticker);
      row[ticker] = map?.get(t) ?? null;
    }
    return row;
  });
}
