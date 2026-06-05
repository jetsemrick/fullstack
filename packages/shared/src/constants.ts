/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/** Maximum tickers allowed in a single batch comparison request. */
export const MAX_COMPARE_TICKERS = 6;

/** Default line colors for comparison chart (session-only, not persisted). */
export const DEFAULT_TICKER_COLORS = [
  "#f54e00", // accent orange
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#dc2626", // red
  "#ca8a04", // yellow
] as const;
