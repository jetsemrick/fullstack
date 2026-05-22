import {
  DEFAULT_TICKER,
  TICKER_MAX_LENGTH,
  isValidTicker,
  normalizeTicker,
  type Watchlist,
} from "@stock/shared";

/**
 * Persistence schema for watchlists in `localStorage`. The version field guards
 * against incompatible schema changes; readers should fall back to an empty
 * state on mismatch rather than crashing.
 */
export interface WatchlistsState {
  version: 1;
  watchlists: Watchlist[];
  activeId: string | null;
  /** Last ticker the user picked across any list, used to restore the chart on reload. */
  lastTicker: string | null;
}

export const STORAGE_KEY = "stock-visualizer:watchlists:v1";
export const STORAGE_VERSION = 1 as const;
const DEFAULT_LIST_NAME = "My watchlist";

/** Result of attempting to add a ticker to a list. Discriminated for UX messaging. */
export type AddTickerResult =
  | { ok: true; ticker: string }
  | { ok: false; reason: "invalid" | "duplicate" | "no-list" };

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wl_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function emptyState(): WatchlistsState {
  return { version: STORAGE_VERSION, watchlists: [], activeId: null, lastTicker: null };
}

/** First-run seed so users see a usable list instead of a blank panel. */
export function initialState(): WatchlistsState {
  const list: Watchlist = { id: createId(), name: DEFAULT_LIST_NAME, tickers: [DEFAULT_TICKER] };
  return { version: STORAGE_VERSION, watchlists: [list], activeId: list.id, lastTicker: DEFAULT_TICKER };
}

function isWatchlist(v: unknown): v is Watchlist {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    Array.isArray(o.tickers) &&
    o.tickers.every((t): t is string => typeof t === "string")
  );
}

/** Defensive parse: any malformed/old payload is discarded and an empty state returned. */
export function parseState(raw: string | null): WatchlistsState {
  if (!raw) return emptyState();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (!parsed || typeof parsed !== "object") return emptyState();
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== STORAGE_VERSION) return emptyState();
  const lists = Array.isArray(obj.watchlists) ? obj.watchlists.filter(isWatchlist) : [];
  const sanitized: Watchlist[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    tickers: l.tickers.map(normalizeTicker).filter((t, i, arr) => isValidTicker(t) && arr.indexOf(t) === i),
  }));
  const activeId = typeof obj.activeId === "string" && sanitized.some((l) => l.id === obj.activeId)
    ? obj.activeId
    : sanitized[0]?.id ?? null;
  const lastTicker = typeof obj.lastTicker === "string" && isValidTicker(normalizeTicker(obj.lastTicker))
    ? normalizeTicker(obj.lastTicker)
    : null;
  return { version: STORAGE_VERSION, watchlists: sanitized, activeId, lastTicker };
}

export function loadState(storage: Storage = window.localStorage): WatchlistsState {
  try {
    return parseState(storage.getItem(STORAGE_KEY));
  } catch {
    return emptyState();
  }
}

/**
 * Synchronously read the persisted `lastTicker` for use as a `useState`
 * initializer. Returning a valid ticker here lets `App` start the first
 * `fetchPrices` call with the correct symbol and avoids a stale/in-flight
 * AAPL fetch racing the restored ticker's fetch on mount.
 */
export function getInitialTicker(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const state = loadState();
  return state.lastTicker ?? fallback;
}

export function saveState(state: WatchlistsState, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy-mode failures are non-fatal: watchlist still works for the session.
  }
}

export function createWatchlist(state: WatchlistsState, rawName: string): WatchlistsState {
  const name = rawName.trim().slice(0, 64) || DEFAULT_LIST_NAME;
  const list: Watchlist = { id: createId(), name, tickers: [] };
  return { ...state, watchlists: [...state.watchlists, list], activeId: list.id };
}

export function renameWatchlist(state: WatchlistsState, id: string, rawName: string): WatchlistsState {
  const name = rawName.trim().slice(0, 64);
  if (!name) return state;
  return {
    ...state,
    watchlists: state.watchlists.map((l) => (l.id === id ? { ...l, name } : l)),
  };
}

export function deleteWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  const remaining = state.watchlists.filter((l) => l.id !== id);
  const activeId = state.activeId === id ? remaining[0]?.id ?? null : state.activeId;
  return { ...state, watchlists: remaining, activeId };
}

export function setActiveWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  if (!state.watchlists.some((l) => l.id === id)) return state;
  return { ...state, activeId: id };
}

export function setLastTicker(state: WatchlistsState, ticker: string): WatchlistsState {
  const t = normalizeTicker(ticker);
  if (!isValidTicker(t)) return state;
  return { ...state, lastTicker: t };
}

export function addTicker(state: WatchlistsState, listId: string, rawTicker: string): {
  state: WatchlistsState;
  result: AddTickerResult;
} {
  const list = state.watchlists.find((l) => l.id === listId);
  if (!list) return { state, result: { ok: false, reason: "no-list" } };
  const trimmed = rawTicker.trim();
  if (!trimmed || trimmed.length > TICKER_MAX_LENGTH) {
    return { state, result: { ok: false, reason: "invalid" } };
  }
  const ticker = normalizeTicker(trimmed);
  if (!isValidTicker(ticker)) {
    return { state, result: { ok: false, reason: "invalid" } };
  }
  if (list.tickers.includes(ticker)) {
    return { state, result: { ok: false, reason: "duplicate" } };
  }
  const updated: Watchlist = { ...list, tickers: [...list.tickers, ticker] };
  return {
    state: { ...state, watchlists: state.watchlists.map((l) => (l.id === listId ? updated : l)) },
    result: { ok: true, ticker },
  };
}

export function removeTicker(state: WatchlistsState, listId: string, ticker: string): WatchlistsState {
  const t = normalizeTicker(ticker);
  return {
    ...state,
    watchlists: state.watchlists.map((l) =>
      l.id === listId ? { ...l, tickers: l.tickers.filter((x) => x !== t) } : l,
    ),
  };
}

export function getActiveWatchlist(state: WatchlistsState): Watchlist | null {
  if (!state.activeId) return null;
  return state.watchlists.find((l) => l.id === state.activeId) ?? null;
}
