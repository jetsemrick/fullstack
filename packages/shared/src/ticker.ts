import { DEFAULT_TICKER } from "./constants";

export const TICKER_MAX_LENGTH = 32;

const TICKER_ALLOWED_CHARS = "A-Za-z0-9._^=-";

export const TICKER_REGEX = new RegExp(`^[${TICKER_ALLOWED_CHARS}]{1,${TICKER_MAX_LENGTH}}$`);

export function normalizeTicker(raw: string | null | undefined, fallback: string = DEFAULT_TICKER): string {
  const normalized = raw?.trim().toUpperCase();
  return normalized || fallback;
}

export function isValidTicker(ticker: string): boolean {
  return TICKER_REGEX.test(ticker);
}
