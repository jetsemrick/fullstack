/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/**
 * Curated list of large-cap S&P 500 symbols for the ticker tape.
 * Covers major sectors: tech, financials, healthcare, consumer, energy.
 */
export const TICKER_TAPE_SYMBOLS = [
  "AAPL",   // Apple - Technology
  "MSFT",   // Microsoft - Technology
  "GOOGL",  // Alphabet - Technology
  "AMZN",   // Amazon - Consumer Discretionary
  "NVDA",   // NVIDIA - Technology
  "META",   // Meta - Technology
  "TSLA",   // Tesla - Consumer Discretionary
  "JPM",    // JPMorgan Chase - Financials
  "V",      // Visa - Financials
  "UNH",    // UnitedHealth - Healthcare
  "JNJ",    // Johnson & Johnson - Healthcare
  "WMT",    // Walmart - Consumer Staples
  "XOM",    // Exxon Mobil - Energy
  "PG",     // Procter & Gamble - Consumer Staples
  "MA",     // Mastercard - Financials
] as const;
