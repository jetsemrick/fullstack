import type { BacktestInput, BacktestResult, BacktestError, PricePoint } from "./types";

/**
 * Parse a YYYY-MM-DD date string into a Date object at midnight UTC.
 * Returns null if invalid format.
 */
function parseDateString(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/**
 * Format a timestamp (Unix seconds) as YYYY-MM-DD in UTC.
 */
function formatDateUTC(timestampSeconds: number): string {
  const d = new Date(timestampSeconds * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute a buy-at-date backtest from a price series.
 *
 * - Resolves entry price as the first daily close on or after the chosen date.
 * - Returns cost basis, market value, and P&L in dollars and percent.
 *
 * @param input - The backtest parameters (series, tradeDate, volume).
 * @returns Either a BacktestResult or a BacktestError.
 */
export function computeBacktest(
  input: BacktestInput
): { ok: true; result: BacktestResult } | { ok: false; error: BacktestError } {
  const { series, tradeDate, volume } = input;

  if (!Number.isFinite(volume) || volume <= 0) {
    return {
      ok: false,
      error: { code: "INVALID_VOLUME", message: "Volume must be a positive number" },
    };
  }

  if (!series || series.length === 0) {
    return {
      ok: false,
      error: { code: "EMPTY_SERIES", message: "Price series is empty" },
    };
  }

  const tradeDateParsed = parseDateString(tradeDate);
  if (!tradeDateParsed) {
    return {
      ok: false,
      error: { code: "INVALID_DATE", message: "Trade date must be in YYYY-MM-DD format" },
    };
  }

  const tradeDateMs = tradeDateParsed.getTime();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  if (tradeDateMs > todayStart.getTime()) {
    return {
      ok: false,
      error: { code: "FUTURE_DATE", message: "Trade date cannot be in the future" },
    };
  }

  const sortedSeries = [...series].sort((a, b) => a.timestamp - b.timestamp);

  // Convert milliseconds to seconds for comparison with PricePoint timestamps (Unix seconds)
  const tradeDateSeconds = Math.floor(tradeDateMs / 1000);
  const entryBar = findEntryBar(sortedSeries, tradeDateSeconds);
  if (!entryBar) {
    return {
      ok: false,
      error: {
        code: "NO_DATA_AFTER_DATE",
        message: "No trading data available on or after the specified date",
      },
    };
  }

  const latestBar = sortedSeries[sortedSeries.length - 1];

  const entryPrice = entryBar.close;
  const latestPrice = latestBar.close;
  const costBasis = entryPrice * volume;
  const marketValue = latestPrice * volume;
  const pnlDollars = marketValue - costBasis;
  const pnlPercent = ((latestPrice - entryPrice) / entryPrice) * 100;

  return {
    ok: true,
    result: {
      entryDate: formatDateUTC(entryBar.timestamp),
      entryPrice,
      latestPrice,
      costBasis,
      marketValue,
      pnlDollars,
      pnlPercent,
    },
  };
}

/**
 * Find the first bar on or after the given date (midnight UTC).
 * @param tradeDateSeconds - Trade date as Unix seconds (not milliseconds)
 */
function findEntryBar(sortedSeries: PricePoint[], tradeDateSeconds: number): PricePoint | null {
  for (const bar of sortedSeries) {
    if (bar.timestamp >= tradeDateSeconds) {
      return bar;
    }
  }
  return null;
}
