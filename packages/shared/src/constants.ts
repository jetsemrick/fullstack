/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated large-cap S&P 500 names for the ambient ticker tape (not user-configurable).
 * Mega/large-cap mix across tech, health care, financials, energy, and staples.
 * Yahoo uses `BRK-B` for Berkshire Hathaway Class B.
 */
export const SP500_TAPE_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "AMZN",
  "META",
  "BRK-B",
  "LLY",
  "JPM",
  "V",
  "UNH",
  "XOM",
  "JNJ",
  "WMT",
  "PG",
] as const;
