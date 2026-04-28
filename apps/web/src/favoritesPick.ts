import { FAVORITES_INTRADAY_COUNT, FAVORITE_TICKER_POOL } from "@stock/shared";

function shuffleStable<T>(arr: T[], seedStr: number): T[] {
  const out = [...arr];
  let s = seedStr % 2147483647 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Pick distinct tickers from the pool excluding the user's main symbol. Deterministic via `shuffleSeed`. */
export function pickFavoriteTickers(mainTicker: string, count: number = FAVORITES_INTRADAY_COUNT, shuffleSeed: number): string[] {
  const exclude = mainTicker.trim().toUpperCase();
  const eligible = FAVORITE_TICKER_POOL.filter((t) => t !== exclude);
  const shuffled = shuffleStable(eligible, shuffleSeed ^ 7919);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
