/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated large-cap S&P 500 constituents shown in the scrolling ticker tape.
 * Static by design (no user-configurable lists per CURSOR-34 scope). Order is
 * the on-screen scroll order; keep ~10-15 symbols to balance variety and request cost.
 */
export const SP_TICKER_SYMBOLS = [
  "AAPL", // Apple
  "MSFT", // Microsoft
  "GOOGL", // Alphabet
  "AMZN", // Amazon
  "NVDA", // NVIDIA
  "META", // Meta Platforms
  "TSLA", // Tesla
  "JPM", // JPMorgan Chase
  "V", // Visa
  "UNH", // UnitedHealth Group
  "JNJ", // Johnson & Johnson
  "WMT", // Walmart
  "XOM", // Exxon Mobil
  "MA", // Mastercard
] as const;
