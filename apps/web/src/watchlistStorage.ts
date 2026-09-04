import { isValidTicker } from "@stock/shared";

export const WATCHLIST_STORAGE_KEY = "cursor-trade:watchlist";
export const WATCHLIST_MAX = 20;
export const WATCHLIST_VERSION = 1 as const;

export type WatchlistState = {
  version: typeof WATCHLIST_VERSION;
  tickers: string[];
};

export type AddWatchlistResult =
  | { ok: true; tickers: string[] }
  | { ok: false; reason: "invalid" | "duplicate" | "full"; tickers: string[] };

export type WatchlistStorage = Pick<Storage, "getItem" | "setItem">;

function sanitizeTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const ticker = item.trim().toUpperCase();
    if (!isValidTicker(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

export function parseWatchlistJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
    const record = parsed as { version?: unknown; tickers?: unknown };
    if (record.version !== WATCHLIST_VERSION) return [];
    return sanitizeTickers(record.tickers);
  } catch {
    return [];
  }
}

export function serializeWatchlist(tickers: string[]): string {
  const state: WatchlistState = {
    version: WATCHLIST_VERSION,
    tickers: sanitizeTickers(tickers),
  };
  return JSON.stringify(state);
}

export function addWatchlistTicker(tickers: string[], ticker: string): AddWatchlistResult {
  const current = sanitizeTickers(tickers);
  const next = ticker.trim().toUpperCase();
  if (!isValidTicker(next)) return { ok: false, reason: "invalid", tickers: current };
  if (current.includes(next)) return { ok: false, reason: "duplicate", tickers: current };
  if (current.length >= WATCHLIST_MAX) return { ok: false, reason: "full", tickers: current };
  return { ok: true, tickers: [...current, next] };
}

export function removeWatchlistTicker(tickers: string[], ticker: string): string[] {
  const next = ticker.trim().toUpperCase();
  return sanitizeTickers(tickers).filter((item) => item !== next);
}

export function loadWatchlist(storage: WatchlistStorage | null | undefined): string[] {
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(WATCHLIST_STORAGE_KEY);
  } catch {
    return [];
  }
  const tickers = parseWatchlistJson(raw);
  const normalized = serializeWatchlist(tickers);
  if (raw != null && raw !== normalized) {
    try {
      storage.setItem(WATCHLIST_STORAGE_KEY, normalized);
    } catch {
      // Quota or private-mode failures should not crash the UI.
    }
  }
  return tickers;
}

export function saveWatchlist(tickers: string[], storage: WatchlistStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(WATCHLIST_STORAGE_KEY, serializeWatchlist(tickers));
  } catch {
    // Quota or private-mode failures should not crash the UI.
  }
}
