/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated large-cap S&P 500 names for the ambient ticker tape (Yahoo symbols).
 * Not the full index — a fixed set of 15 names keeps the batched quote small.
 * Array order is display order. The list is not user-configurable.
 */
export const SP_TAPE_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "BRK-B",
  "LLY",
  "AVGO",
  "JPM",
  "TSLA",
  "UNH",
  "XOM",
  "V",
  "JNJ",
] as const;
