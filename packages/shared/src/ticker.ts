import { MAX_COMPARE_TICKERS } from "./constants";

/** Ticker format: letters, numbers, dots, dashes, underscores, ^, = (max 32 chars). */
const TICKER_PATTERN = /^[A-Za-z0-9._^=-]{1,32}$/;

/** Normalize a ticker symbol: trim whitespace and uppercase. */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/** Validate a single ticker symbol format. */
export function isValidTicker(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker);
}

/** Parse and validate a comma-separated ticker list. Returns normalized unique tickers. */
export function parseTickerList(
  input: string
): { tickers: string[]; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  const tickers: string[] = [];

  if (!input.trim()) {
    errors.push("Ticker list cannot be empty");
    return { tickers, errors };
  }

  const parts = input.split(",").map((t) => t.trim()).filter(Boolean);

  for (const raw of parts) {
    const normalized = normalizeTicker(raw);
    if (!isValidTicker(normalized)) {
      errors.push(`Invalid ticker format: ${raw}`);
      continue;
    }
    if (seen.has(normalized)) {
      continue; // Dedupe silently
    }
    seen.add(normalized);
    tickers.push(normalized);
  }

  if (tickers.length > MAX_COMPARE_TICKERS) {
    errors.push(
      `Too many tickers: ${tickers.length} exceeds maximum of ${MAX_COMPARE_TICKERS}`
    );
    tickers.length = MAX_COMPARE_TICKERS;
  }

  return { tickers, errors };
}
