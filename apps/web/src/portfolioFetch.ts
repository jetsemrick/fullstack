import { fetchPrices } from "./api";

export type SpotQuoteResult =
  | { ok: true; ticker: string; lastPrice: number | null; currency: string | null }
  | { ok: false; ticker: string; error: string };

/**
 * Fetches last prices for unique tickers with a simple concurrency pool to avoid bursting the API.
 */
export async function fetchSpotQuotes(tickers: string[], concurrency = 3): Promise<SpotQuoteResult[]> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return [];

  const results: SpotQuoteResult[] = new Array(unique.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= unique.length) return;
      const ticker = unique[i]!;
      const res = await fetchPrices({ ticker, range: "1d", interval: "5m" });
      if (!res.ok) {
        results[i] = { ok: false, ticker, error: res.error.error ?? "Request failed" };
      } else {
        results[i] = {
          ok: true,
          ticker: res.data.ticker,
          lastPrice: res.data.lastPrice,
          currency: res.data.currency,
        };
      }
    }
  }

  const pool = Math.min(Math.max(1, concurrency), unique.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}
