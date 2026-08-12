const STORAGE_KEY = "stock-visualizer:watchlist";
const MAX_WATCHLIST = 20;
const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export function normalizeWatchlistTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase();
  if (!ticker || !TICKER_RE.test(ticker)) return null;
  return ticker;
}

export function readWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const ticker = normalizeWatchlistTicker(item);
      if (!ticker || out.includes(ticker)) continue;
      out.push(ticker);
      if (out.length >= MAX_WATCHLIST) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function writeWatchlist(tickers: string[]): string[] {
  const out: string[] = [];
  for (const item of tickers) {
    const ticker = normalizeWatchlistTicker(item);
    if (!ticker || out.includes(ticker)) continue;
    out.push(ticker);
    if (out.length >= MAX_WATCHLIST) break;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // Ignore quota / private mode failures; UI still works in-memory.
  }
  return out;
}

export function addToWatchlist(tickers: string[], raw: string): string[] {
  const ticker = normalizeWatchlistTicker(raw);
  if (!ticker) return tickers;
  if (tickers.includes(ticker)) return tickers;
  return writeWatchlist([ticker, ...tickers]);
}

export function removeFromWatchlist(tickers: string[], raw: string): string[] {
  const ticker = normalizeWatchlistTicker(raw);
  if (!ticker) return tickers;
  if (!tickers.includes(ticker)) return tickers;
  return writeWatchlist(tickers.filter((t) => t !== ticker));
}

export function toggleWatchlist(tickers: string[], raw: string): string[] {
  const ticker = normalizeWatchlistTicker(raw);
  if (!ticker) return tickers;
  return tickers.includes(ticker)
    ? removeFromWatchlist(tickers, ticker)
    : addToWatchlist(tickers, ticker);
}

export const WATCHLIST_STORAGE_KEY = STORAGE_KEY;
export const WATCHLIST_MAX = MAX_WATCHLIST;
