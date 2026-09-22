import type { PricePoint } from "./types";

/** US equity session dates. Daily Yahoo bars are mapped onto this calendar. */
export const BACKTEST_TIME_ZONE = "America/New_York";

const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type BacktestErrorCode =
  | "INVALID_TICKER"
  | "INVALID_VOLUME"
  | "INVALID_DATE"
  | "FUTURE_DATE"
  | "NO_BARS";

export interface BuyAtDateBacktest {
  ticker: string;
  volume: number;
  /** Calendar date the user requested (YYYY-MM-DD, Eastern). */
  requestedDate: string;
  /** Session date of the daily bar used as the fill. */
  entryDate: string;
  entryTimestamp: number;
  entryClose: number;
  latestDate: string;
  latestTimestamp: number;
  latestClose: number;
  costBasis: number;
  marketValue: number;
  pnlDollars: number;
  pnlPercent: number;
}

export type BacktestOutcome =
  | { ok: true; result: BuyAtDateBacktest }
  | { ok: false; code: BacktestErrorCode; error: string };

interface ValidatedBacktestInput {
  ticker: string;
  volume: number;
  tradeDate: string;
}

/** YYYY-MM-DD for an instant in `timeZone` (default US Eastern). */
export function calendarDate(unixSeconds: number, timeZone: string = BACKTEST_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(unixSeconds * 1000));
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

/** Today's calendar date in US Eastern. */
export function calendarToday(now: Date = new Date(), timeZone: string = BACKTEST_TIME_ZONE): string {
  return calendarDate(now.getTime() / 1000, timeZone);
}

function fail(code: BacktestErrorCode, error: string): { ok: false; code: BacktestErrorCode; error: string } {
  return { ok: false, code, error };
}

function parseIsoDate(raw: string): string | null {
  const match = ISO_DATE_RE.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

type ValidationResult =
  | { ok: true; value: ValidatedBacktestInput }
  | { ok: false; code: BacktestErrorCode; error: string };

export function validateBuyAtDateInput(input: {
  ticker: string;
  volume: string;
  tradeDate: string;
  now?: Date;
}): ValidationResult {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) return fail("INVALID_TICKER", "Enter a ticker.");
  if (!TICKER_RE.test(ticker)) return fail("INVALID_TICKER", "Enter a valid ticker symbol.");

  const volumeRaw = input.volume.trim();
  if (!volumeRaw) return fail("INVALID_VOLUME", "Enter a share volume.");
  const volume = Number(volumeRaw);
  if (!Number.isFinite(volume)) return fail("INVALID_VOLUME", "Share volume must be a positive number.");
  if (volume <= 0) return fail("INVALID_VOLUME", "Share volume must be greater than zero.");

  const tradeDate = parseIsoDate(input.tradeDate);
  if (!tradeDate) {
    const empty = input.tradeDate.trim() === "";
    return fail("INVALID_DATE", empty ? "Choose a trade date." : "Enter a valid trade date.");
  }
  const today = calendarToday(input.now ?? new Date());
  if (tradeDate > today) return fail("FUTURE_DATE", "Trade date cannot be in the future.");

  return { ok: true, value: { ticker, volume, tradeDate } };
}

interface UsableBar {
  timestamp: number;
  close: number;
  sessionDate: string;
}

function usableBars(series: readonly PricePoint[]): UsableBar[] {
  const bars: UsableBar[] = [];
  for (const point of series) {
    if (typeof point.timestamp !== "number" || !Number.isFinite(point.timestamp)) continue;
    if (typeof point.close !== "number" || !Number.isFinite(point.close) || point.close <= 0) continue;
    bars.push({
      timestamp: point.timestamp,
      close: point.close,
      sessionDate: calendarDate(point.timestamp),
    });
  }
  bars.sort((a, b) => a.timestamp - b.timestamp);
  return bars;
}

/**
 * Hypothetical buy of `volume` shares at the first daily close on or after `tradeDate`.
 * P&L is unrealized through the latest usable close in `series`.
 */
export function computeBuyAtDateBacktest(input: {
  ticker: string;
  volume: string;
  tradeDate: string;
  series: readonly PricePoint[];
  now?: Date;
}): BacktestOutcome {
  const validated = validateBuyAtDateInput(input);
  if (!validated.ok) return validated;
  const { ticker, volume, tradeDate } = validated.value;

  const bars = usableBars(input.series);
  const entryIndex = bars.findIndex((bar) => bar.sessionDate >= tradeDate);
  if (entryIndex < 0) {
    return fail("NO_BARS", "No daily close on or after that date.");
  }
  const entry = bars[entryIndex];
  const latest = bars[bars.length - 1];
  if (!entry || !latest) {
    return fail("NO_BARS", "No daily close on or after that date.");
  }

  const costBasis = entry.close * volume;
  const marketValue = latest.close * volume;
  const pnlDollars = (latest.close - entry.close) * volume;
  const pnlPercent = ((latest.close - entry.close) / entry.close) * 100;

  return {
    ok: true,
    result: {
      ticker,
      volume,
      requestedDate: tradeDate,
      entryDate: entry.sessionDate,
      entryTimestamp: entry.timestamp,
      entryClose: entry.close,
      latestDate: latest.sessionDate,
      latestTimestamp: latest.timestamp,
      latestClose: latest.close,
      costBasis,
      marketValue,
      pnlDollars,
      pnlPercent,
    },
  };
}
