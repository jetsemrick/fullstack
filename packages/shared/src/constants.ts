/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

export const TICKER_MAX_LENGTH = 32 as const;

export const TICKER_REGEX = /^[A-Za-z0-9._^=-]{1,32}$/;

export function normalizeTicker(raw: string | null | undefined, fallback: string = DEFAULT_TICKER): string {
  const normalized = raw?.trim().toUpperCase();
  return normalized || fallback;
}

export function isValidTicker(ticker: string): boolean {
  return TICKER_REGEX.test(ticker);
}

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;
