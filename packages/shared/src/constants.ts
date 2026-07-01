/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/** Maximum number of tickers to compare on one chart (including the primary ticker). */
export const MAX_COMPARE_TICKERS = 5 as const;

/** Accessible color palette for multi-ticker chart series. */
export const COMPARE_COLORS = [
  "#f54e00",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#dc2626",
] as const;
