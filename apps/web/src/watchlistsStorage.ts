import {
  DEFAULT_TICKER,
  isValidTicker,
  normalizeTicker,
  type Watchlist,
} from "@stock/shared";

export const WATCHLISTS_STORAGE_KEY = "stock-visualizer:watchlists:v1";

export interface WatchlistsState {
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  lastTicker: string;
}

interface StoredWatchlistsState {
  version: 1;
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  lastTicker: string;
}

const DEFAULT_STATE: WatchlistsState = {
  watchlists: [],
  activeWatchlistId: null,
  lastTicker: DEFAULT_TICKER,
};

function copyState(state: WatchlistsState): WatchlistsState {
  return {
    watchlists: state.watchlists.map((watchlist) => ({
      ...watchlist,
      tickers: [...watchlist.tickers],
    })),
    activeWatchlistId: state.activeWatchlistId,
    lastTicker: state.lastTicker,
  };
}

function createId(): string {
  return `watchlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeTickers(tickers: unknown): string[] {
  if (!Array.isArray(tickers)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of tickers) {
    if (typeof item !== "string") continue;
    const ticker = normalizeTicker(item, "");
    if (!ticker || !isValidTicker(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    normalized.push(ticker);
  }
  return normalized;
}

function normalizeWatchlist(raw: unknown): Watchlist | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { id?: unknown; name?: unknown; tickers?: unknown };
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.name !== "string" || !cleanName(value.name)) return null;
  return {
    id: value.id,
    name: cleanName(value.name),
    tickers: normalizeTickers(value.tickers),
  };
}

export function emptyWatchlistsState(): WatchlistsState {
  return copyState(DEFAULT_STATE);
}

export function parseWatchlistsState(raw: string | null): WatchlistsState {
  if (!raw) return emptyWatchlistsState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyWatchlistsState();
    const value = parsed as Partial<StoredWatchlistsState>;
    if (value.version !== 1) return emptyWatchlistsState();

    const watchlists = Array.isArray(value.watchlists)
      ? value.watchlists
          .map((watchlist) => normalizeWatchlist(watchlist))
          .filter((watchlist): watchlist is Watchlist => watchlist !== null)
      : [];
    const activeWatchlistId =
      typeof value.activeWatchlistId === "string" &&
      watchlists.some((watchlist) => watchlist.id === value.activeWatchlistId)
        ? value.activeWatchlistId
        : watchlists[0]?.id ?? null;
    const rawLastTicker = typeof value.lastTicker === "string" ? value.lastTicker : undefined;
    const lastTicker = normalizeTicker(rawLastTicker, DEFAULT_TICKER);

    return {
      watchlists,
      activeWatchlistId,
      lastTicker: isValidTicker(lastTicker) ? lastTicker : DEFAULT_TICKER,
    };
  } catch {
    return emptyWatchlistsState();
  }
}

export function serializeWatchlistsState(state: WatchlistsState): string {
  const stored: StoredWatchlistsState = {
    version: 1,
    watchlists: state.watchlists,
    activeWatchlistId: state.activeWatchlistId,
    lastTicker: state.lastTicker,
  };
  return JSON.stringify(stored);
}

export function loadWatchlistsState(storage: Pick<Storage, "getItem"> = window.localStorage): WatchlistsState {
  return parseWatchlistsState(storage.getItem(WATCHLISTS_STORAGE_KEY));
}

export function saveWatchlistsState(
  state: WatchlistsState,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  storage.setItem(WATCHLISTS_STORAGE_KEY, serializeWatchlistsState(state));
}

export function getActiveWatchlist(state: WatchlistsState): Watchlist | null {
  return state.watchlists.find((watchlist) => watchlist.id === state.activeWatchlistId) ?? null;
}

export function createWatchlist(state: WatchlistsState, name: string): WatchlistsState {
  const watchlist: Watchlist = {
    id: createId(),
    name: cleanName(name) || "Untitled",
    tickers: [],
  };
  return {
    ...copyState(state),
    watchlists: [...state.watchlists, watchlist],
    activeWatchlistId: watchlist.id,
  };
}

export function renameWatchlist(state: WatchlistsState, id: string, name: string): WatchlistsState {
  const nextName = cleanName(name);
  if (!nextName) return copyState(state);
  return {
    ...copyState(state),
    watchlists: state.watchlists.map((watchlist) =>
      watchlist.id === id ? { ...watchlist, name: nextName, tickers: [...watchlist.tickers] } : { ...watchlist, tickers: [...watchlist.tickers] },
    ),
  };
}

export function deleteWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  const watchlists = state.watchlists.filter((watchlist) => watchlist.id !== id);
  const activeWatchlistId =
    state.activeWatchlistId === id ? watchlists[0]?.id ?? null : state.activeWatchlistId;
  return {
    watchlists: watchlists.map((watchlist) => ({ ...watchlist, tickers: [...watchlist.tickers] })),
    activeWatchlistId,
    lastTicker: state.lastTicker,
  };
}

export function setActiveWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  if (!state.watchlists.some((watchlist) => watchlist.id === id)) return copyState(state);
  return {
    ...copyState(state),
    activeWatchlistId: id,
  };
}

export type AddTickerResult =
  | { ok: true; state: WatchlistsState; ticker: string }
  | { ok: false; error: string };

export function addTickerToActiveWatchlist(state: WatchlistsState, rawTicker: string): AddTickerResult {
  const active = getActiveWatchlist(state);
  if (!active) return { ok: false, error: "Create a watchlist first." };

  const ticker = normalizeTicker(rawTicker, "");
  if (!ticker) return { ok: false, error: "Enter a ticker symbol." };
  if (!isValidTicker(ticker)) return { ok: false, error: "Use 1-32 letters, numbers, or . _ ^ = -." };
  if (active.tickers.includes(ticker)) return { ok: false, error: `${ticker} is already in this watchlist.` };

  return {
    ok: true,
    ticker,
    state: {
      ...copyState(state),
      watchlists: state.watchlists.map((watchlist) =>
        watchlist.id === active.id
          ? { ...watchlist, tickers: [...watchlist.tickers, ticker] }
          : { ...watchlist, tickers: [...watchlist.tickers] },
      ),
      lastTicker: ticker,
    },
  };
}

export function removeTickerFromWatchlist(state: WatchlistsState, watchlistId: string, ticker: string): WatchlistsState {
  return {
    ...copyState(state),
    watchlists: state.watchlists.map((watchlist) =>
      watchlist.id === watchlistId
        ? { ...watchlist, tickers: watchlist.tickers.filter((item) => item !== ticker) }
        : { ...watchlist, tickers: [...watchlist.tickers] },
    ),
  };
}

export function setLastTicker(state: WatchlistsState, rawTicker: string): WatchlistsState {
  const ticker = normalizeTicker(rawTicker, DEFAULT_TICKER);
  return {
    ...copyState(state),
    lastTicker: isValidTicker(ticker) ? ticker : DEFAULT_TICKER,
  };
}

export function getInitialTicker(fallback = DEFAULT_TICKER): string {
  if (typeof window === "undefined") return fallback;
  return loadWatchlistsState().lastTicker;
}
