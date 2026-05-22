/** Default Yahoo chart window: full history so client horizons (1Y, 5Y, etc.) can slice meaningfully. */
export const DEFAULT_RANGE = "max" as const;
export const DEFAULT_INTERVAL = "1d" as const;

export const DEFAULT_TICKER = "AAPL" as const;

/** Yahoo symbols for S&P 500, Dow Jones Industrial Average, and Nasdaq Composite quotes. */
export const MAJOR_INDEX_SYMBOLS = ["^GSPC", "^DJI", "^IXIC"] as const;

/** Maximum length the API will accept for a ticker symbol. */
export const TICKER_MAX_LENGTH = 32;

/**
 * Accepted ticker characters: letters, digits, dot, hyphen, underscore, caret
 * (Yahoo indexes such as `^GSPC`), and equals (Yahoo futures such as `ES=F`).
 * Must stay in sync with the API regex in `apps/api/src/routes.ts`.
 */
export const TICKER_REGEX = /^[A-Za-z0-9._^=-]{1,32}$/;

/** Returns the canonical form used by the API: trimmed and upper-cased. */
export function normalizeTicker(input: string): string {
  return input.trim().toUpperCase();
}

/** True when `input` passes the shared ticker shape check. */
export function isValidTicker(input: string): boolean {
  return TICKER_REGEX.test(input);
}
