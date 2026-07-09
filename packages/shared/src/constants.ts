/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/** Minimum tickers required to enter compare overlay mode. */
export const MIN_COMPARE_TICKERS = 2 as const;

/** Maximum tickers allowed on one compare chart. */
export const MAX_COMPARE_TICKERS = 5 as const;

/**
 * Default normalization when overlaying multiple tickers.
 * `indexed` rebases each series to 100 at the first shared timestamp (relative performance).
 * `absolute` plots raw close prices (useful when tickers share a similar price scale).
 */
export const DEFAULT_COMPARE_NORMALIZATION = "indexed" as const;

/** Accessible, distinguishable series colors for multi-ticker charts (light and dark). */
export const COMPARE_SERIES_COLORS = [
  "#f54e00",
  "#2563eb",
  "#2b703e",
  "#9333ea",
  "#ba3b3b",
] as const;
