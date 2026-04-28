/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/** Pool used to randomly pick picks for the "favorites" intraday snapshot (distinct from search ticker). */
export const FAVORITE_TICKER_POOL = [
  "MSFT",
  "GOOG",
  "META",
  "NVDA",
  "CRM",
  "JPM",
  "KO",
  "DIS",
  "V",
  "JNJ",
  "WMT",
  "MA",
  "PG",
  "UNH",
  "XOM",
] as const;

export const FAVORITES_INTRADAY_COUNT = 5;
