import type { PricePoint } from "./types";

/** Input for computing a buy-at-date backtest. */
export interface BacktestInput {
  /** Unix timestamp in seconds for the desired trade date (start of day UTC). */
  tradeDateTimestamp: number;
  /** Number of shares purchased (must be positive). */
  volume: number;
  /** The price series from Yahoo (range=max, interval=1d). */
  series: PricePoint[];
}

/** Result of computing a buy-at-date backtest. */
export interface BacktestResult {
  /** Unix timestamp in seconds of the actual entry bar used. */
  entryTimestamp: number;
  /** Close price on the entry date. */
  entryPrice: number;
  /** Unix timestamp in seconds of the latest bar. */
  latestTimestamp: number;
  /** Close price on the latest date. */
  latestPrice: number;
  /** Cost basis: entryPrice * volume. */
  costBasis: number;
  /** Current market value: latestPrice * volume. */
  marketValue: number;
  /** Dollar P&L: marketValue - costBasis. */
  dollarPnL: number;
  /** Percent P&L: (latestPrice - entryPrice) / entryPrice * 100. */
  percentPnL: number;
}

/** Error types for backtest computation. */
export type BacktestErrorCode =
  | "INVALID_VOLUME"
  | "FUTURE_DATE"
  | "EMPTY_SERIES"
  | "NO_DATA_ON_OR_AFTER_DATE";

/** Error result from backtest computation. */
export interface BacktestError {
  code: BacktestErrorCode;
  message: string;
}

/**
 * Compute buy-at-date backtest P&L from a price series.
 *
 * Entry price is the first daily close on or after the chosen trade date.
 * Returns error for invalid inputs or when no data exists on or after the date.
 */
export function computeBacktest(
  input: BacktestInput
): { ok: true; result: BacktestResult } | { ok: false; error: BacktestError } {
  const { tradeDateTimestamp, volume, series } = input;

  if (volume <= 0 || !Number.isFinite(volume)) {
    return {
      ok: false,
      error: { code: "INVALID_VOLUME", message: "Volume must be a positive number" },
    };
  }

  if (!series || series.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SERIES", message: "No price data available" },
    };
  }

  const latestBar = series[series.length - 1];
  if (tradeDateTimestamp > latestBar.timestamp) {
    return {
      ok: false,
      error: { code: "FUTURE_DATE", message: "Trade date is in the future" },
    };
  }

  const entryBar = series.find((p) => p.timestamp >= tradeDateTimestamp);
  if (!entryBar) {
    return {
      ok: false,
      error: {
        code: "NO_DATA_ON_OR_AFTER_DATE",
        message: "No price data available on or after the selected date",
      },
    };
  }

  const entryPrice = entryBar.close;
  const latestPrice = latestBar.close;
  const costBasis = entryPrice * volume;
  const marketValue = latestPrice * volume;
  const dollarPnL = marketValue - costBasis;
  const percentPnL = ((latestPrice - entryPrice) / entryPrice) * 100;

  return {
    ok: true,
    result: {
      entryTimestamp: entryBar.timestamp,
      entryPrice,
      latestTimestamp: latestBar.timestamp,
      latestPrice,
      costBasis,
      marketValue,
      dollarPnL,
      percentPnL,
    },
  };
}

/**
 * Convert a date string (YYYY-MM-DD) to a Unix timestamp in seconds (start of day UTC).
 */
export function dateStringToTimestamp(dateStr: string): number {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Convert a Unix timestamp in seconds to a formatted date string (YYYY-MM-DD).
 */
export function timestampToDateString(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split("T")[0];
}
