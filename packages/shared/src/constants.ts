/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated large-cap S&P 500 constituents shown in the scrolling ticker tape.
 * Hand-picked, high-liquidity names across sectors; not user-configurable (see CURSOR-34 scope).
 * Yahoo symbols (note `BRK-B` uses a hyphen).
 */
export const SP_TICKER_TAPE_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "BRK-B",
  "JPM",
  "V",
  "JNJ",
  "WMT",
  "XOM",
  "UNH",
] as const;
