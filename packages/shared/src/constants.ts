/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated large-cap S&P 500 constituents shown in the scrolling ticker tape.
 * Kept to ~14 names to balance visual density against Yahoo request volume.
 * Symbols use Yahoo conventions (e.g. `BRK-B` for Berkshire Hathaway class B).
 */
export const SP_TICKER_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "BRK-B",
  "JPM",
  "TSLA",
  "V",
  "UNH",
  "XOM",
  "JNJ",
  "WMT",
] as const;

/** Upper bound on symbols accepted by the batch quote route, guarding upstream volume. */
export const MAX_QUOTE_SYMBOLS = 30;
