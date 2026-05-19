import { DEFAULT_TICKER } from "./constants";

/** Maximum ticker length aligned with Yahoo/API validation. */
export const TICKER_MAX_LENGTH = 32;

/** Allowed ticker characters (after trim + uppercase), length 1–32. */
export const TICKER_PATTERN = /^[A-Za-z0-9._^=-]{1,32}$/;

/**
 * Normalize ticker from a URL/query parameter: blank or whitespace-only becomes the default.
 */
export function normalizeTickerFromQuery(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_TICKER;
  return raw.trim().toUpperCase();
}

/** Normalize user-typed ticker input (trim + uppercase). Empty string if only whitespace. */
export function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Whether the symbol satisfies API ticker validation (already normalized). */
export function isValidTickerSymbol(symbol: string): boolean {
  return TICKER_PATTERN.test(symbol);
}
