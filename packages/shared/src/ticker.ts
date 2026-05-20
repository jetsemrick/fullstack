import { DEFAULT_TICKER } from "./constants";

/** Max ticker length accepted by the API (`routes.ts`). */
export const TICKER_MAX_LENGTH = 32;

/** Same pattern as `apps/api/src/routes.ts` — letters, digits, and . _ ^ = - */
export const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export function normalizeTicker(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_TICKER;
  return raw.trim().toUpperCase();
}

/** Returns a user-facing validation message, or `null` when the ticker is valid. */
export function validateTickerFormat(ticker: string): string | null {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return "Ticker is required";
  if (normalized.length > TICKER_MAX_LENGTH) {
    return `Ticker must be at most ${TICKER_MAX_LENGTH} characters`;
  }
  if (!TICKER_RE.test(normalized)) {
    return "Invalid ticker format (use letters, numbers, and . _ ^ = - only)";
  }
  return null;
}
