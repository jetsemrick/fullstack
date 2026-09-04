import { DEFAULT_TICKER } from "./constants";

/** Allowed Yahoo-style ticker characters; 1–32 after trim/uppercase. */
export const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export function isValidTicker(ticker: string): boolean {
  return TICKER_RE.test(ticker);
}

/**
 * Trim and uppercase a ticker query. Empty or missing input becomes {@link DEFAULT_TICKER}
 * so `/api/prices` can omit `ticker`.
 */
export function normalizeTicker(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT_TICKER;
  return raw.trim().toUpperCase();
}
