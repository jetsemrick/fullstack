import { DEFAULT_TICKER, isValidTicker, normalizeTicker } from "@stock/shared";

export interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
}

export interface WatchlistsState {
  version: 1;
  watchlists: Watchlist[];
  activeWatchlistId: string;
  lastTicker: string | null;
}

export type WatchlistsResult =
  | { ok: true; state: WatchlistsState }
  | { ok: false; state: WatchlistsState; error: string };

export const WATCHLISTS_STORAGE_KEY = "stock-visualizer:watchlists:v1";
export const DEFAULT_WATCHLIST_ID = "default";
export const DEFAULT_WATCHLIST_NAME = "My Watchlist";

const WATCHLISTS_VERSION = 1;
const MAX_WATCHLIST_NAME_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeValidTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ticker = normalizeTicker(raw, "");
  return ticker && isValidTicker(ticker) ? ticker : null;
}

function normalizeWatchlistName(name: string): string {
  return name.trim().slice(0, MAX_WATCHLIST_NAME_LENGTH);
}

function uniqueTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tickers: string[] = [];
  for (const value of raw) {
    const ticker = normalizeValidTicker(value);
    if (ticker && !tickers.includes(ticker)) tickers.push(ticker);
  }
  return tickers;
}

function createWatchlistId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `watchlist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function copyState(state: WatchlistsState): WatchlistsState {
  return {
    ...state,
    watchlists: state.watchlists.map((watchlist) => ({
      ...watchlist,
      tickers: [...watchlist.tickers],
    })),
  };
}

export function createDefaultWatchlistsState(initialTicker: string = DEFAULT_TICKER): WatchlistsState {
  const ticker = normalizeValidTicker(initialTicker) ?? DEFAULT_TICKER;
  return {
    version: WATCHLISTS_VERSION,
    watchlists: [{ id: DEFAULT_WATCHLIST_ID, name: DEFAULT_WATCHLIST_NAME, tickers: [ticker] }],
    activeWatchlistId: DEFAULT_WATCHLIST_ID,
    lastTicker: ticker,
  };
}

export function parseWatchlistsState(serialized: string | null): WatchlistsState {
  if (!serialized) return createDefaultWatchlistsState();
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.version !== WATCHLISTS_VERSION || !Array.isArray(value.watchlists)) {
      return createDefaultWatchlistsState();
    }

    const seenIds = new Set<string>();
    const watchlists: Watchlist[] = [];
    for (const item of value.watchlists) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const id = item.id.trim();
      const name = normalizeWatchlistName(item.name);
      if (!id || !name || seenIds.has(id)) continue;
      seenIds.add(id);
      watchlists.push({ id, name, tickers: uniqueTickers(item.tickers) });
    }

    if (watchlists.length === 0) return createDefaultWatchlistsState();

    const activeWatchlistId =
      typeof value.activeWatchlistId === "string" && watchlists.some((watchlist) => watchlist.id === value.activeWatchlistId)
        ? value.activeWatchlistId
        : watchlists[0].id;
    const lastTicker = normalizeValidTicker(value.lastTicker);

    return {
      version: WATCHLISTS_VERSION,
      watchlists,
      activeWatchlistId,
      lastTicker,
    };
  } catch {
    return createDefaultWatchlistsState();
  }
}

export function loadWatchlistsState(storage: Storage = localStorage): WatchlistsState {
  try {
    return parseWatchlistsState(storage.getItem(WATCHLISTS_STORAGE_KEY));
  } catch {
    return createDefaultWatchlistsState();
  }
}

export function saveWatchlistsState(state: WatchlistsState, storage: Storage = localStorage): void {
  storage.setItem(WATCHLISTS_STORAGE_KEY, JSON.stringify(state));
}

export function getInitialTicker(fallback: string = DEFAULT_TICKER, storage: Storage = localStorage): string {
  try {
    const state = parseWatchlistsState(storage.getItem(WATCHLISTS_STORAGE_KEY));
    return state.lastTicker ?? normalizeTicker(fallback);
  } catch {
    return normalizeTicker(fallback);
  }
}

export function getActiveWatchlist(state: WatchlistsState): Watchlist {
  return state.watchlists.find((watchlist) => watchlist.id === state.activeWatchlistId) ?? state.watchlists[0];
}

export function createWatchlist(state: WatchlistsState, name: string, id = createWatchlistId()): WatchlistsResult {
  const watchlistName = normalizeWatchlistName(name);
  if (!watchlistName) return { ok: false, state, error: "Enter a watchlist name." };
  if (state.watchlists.some((watchlist) => watchlist.name.toLowerCase() === watchlistName.toLowerCase())) {
    return { ok: false, state, error: "A watchlist with that name already exists." };
  }
  const next = copyState(state);
  next.watchlists.push({ id, name: watchlistName, tickers: [] });
  next.activeWatchlistId = id;
  return { ok: true, state: next };
}

export function renameWatchlist(state: WatchlistsState, watchlistId: string, name: string): WatchlistsResult {
  const watchlistName = normalizeWatchlistName(name);
  if (!watchlistName) return { ok: false, state, error: "Enter a watchlist name." };
  if (
    state.watchlists.some(
      (watchlist) => watchlist.id !== watchlistId && watchlist.name.toLowerCase() === watchlistName.toLowerCase(),
    )
  ) {
    return { ok: false, state, error: "A watchlist with that name already exists." };
  }
  if (!state.watchlists.some((watchlist) => watchlist.id === watchlistId)) {
    return { ok: false, state, error: "Watchlist not found." };
  }
  const next = copyState(state);
  next.watchlists = next.watchlists.map((watchlist) =>
    watchlist.id === watchlistId ? { ...watchlist, name: watchlistName } : watchlist,
  );
  return { ok: true, state: next };
}

export function deleteWatchlist(state: WatchlistsState, watchlistId: string): WatchlistsState {
  const remaining = state.watchlists.filter((watchlist) => watchlist.id !== watchlistId);
  if (remaining.length === 0) return createDefaultWatchlistsState(state.lastTicker ?? DEFAULT_TICKER);
  const activeWatchlistId =
    state.activeWatchlistId === watchlistId || !remaining.some((watchlist) => watchlist.id === state.activeWatchlistId)
      ? remaining[0].id
      : state.activeWatchlistId;
  return {
    ...state,
    watchlists: remaining.map((watchlist) => ({ ...watchlist, tickers: [...watchlist.tickers] })),
    activeWatchlistId,
  };
}

export function setActiveWatchlist(state: WatchlistsState, watchlistId: string): WatchlistsState {
  if (!state.watchlists.some((watchlist) => watchlist.id === watchlistId)) return state;
  if (state.activeWatchlistId === watchlistId) return state;
  return { ...copyState(state), activeWatchlistId: watchlistId };
}

export function addTickerToWatchlist(state: WatchlistsState, watchlistId: string, rawTicker: string): WatchlistsResult {
  const ticker = normalizeTicker(rawTicker, "");
  if (!ticker) return { ok: false, state, error: "Enter a ticker symbol." };
  if (!isValidTicker(ticker)) return { ok: false, state, error: "Invalid ticker format." };
  const watchlist = state.watchlists.find((item) => item.id === watchlistId);
  if (!watchlist) return { ok: false, state, error: "Watchlist not found." };
  if (watchlist.tickers.includes(ticker)) return { ok: false, state, error: `${ticker} is already in this watchlist.` };
  const next = copyState(state);
  next.watchlists = next.watchlists.map((item) =>
    item.id === watchlistId ? { ...item, tickers: [...item.tickers, ticker] } : item,
  );
  return { ok: true, state: next };
}

export function removeTickerFromWatchlist(state: WatchlistsState, watchlistId: string, ticker: string): WatchlistsState {
  const normalized = normalizeTicker(ticker, "");
  const next = copyState(state);
  next.watchlists = next.watchlists.map((watchlist) =>
    watchlist.id === watchlistId
      ? { ...watchlist, tickers: watchlist.tickers.filter((item) => item !== normalized) }
      : watchlist,
  );
  return next;
}

export function setLastTicker(state: WatchlistsState, rawTicker: string): WatchlistsState {
  const ticker = normalizeTicker(rawTicker, "");
  if (!ticker || !isValidTicker(ticker) || state.lastTicker === ticker) return state;
  return { ...copyState(state), lastTicker: ticker };
}
