import { validateTickerFormat } from "@stock/shared";

export type Watchlist = {
  id: string;
  name: string;
  symbols: string[];
};

export type WatchlistsState = {
  watchlists: Watchlist[];
  activeId: string | null;
};

export const WATCHLISTS_STORAGE_KEY = "stock-visualizer-watchlists-v1";

function newId(): string {
  return crypto.randomUUID();
}

export function createDefaultWatchlistsState(): WatchlistsState {
  const id = newId();
  return {
    watchlists: [{ id, name: "My watchlist", symbols: [] }],
    activeId: id,
  };
}

function isWatchlist(value: unknown): value is Watchlist {
  if (!value || typeof value !== "object") return false;
  const w = value as Watchlist;
  return (
    typeof w.id === "string" &&
    typeof w.name === "string" &&
    Array.isArray(w.symbols) &&
    w.symbols.every((s) => typeof s === "string")
  );
}

export function parseWatchlistsState(raw: string): WatchlistsState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const { watchlists, activeId } = parsed as WatchlistsState;
    if (!Array.isArray(watchlists) || !watchlists.every(isWatchlist)) return null;
    const active =
      activeId === null || watchlists.some((w) => w.id === activeId) ? activeId : watchlists[0]?.id ?? null;
    return { watchlists, activeId: active };
  } catch {
    return null;
  }
}

export function loadWatchlistsState(storage: Storage | null): WatchlistsState {
  if (!storage) return createDefaultWatchlistsState();
  const raw = storage.getItem(WATCHLISTS_STORAGE_KEY);
  if (!raw) return createDefaultWatchlistsState();
  return parseWatchlistsState(raw) ?? createDefaultWatchlistsState();
}

export function saveWatchlistsState(storage: Storage | null, state: WatchlistsState): void {
  if (!storage) return;
  storage.setItem(WATCHLISTS_STORAGE_KEY, JSON.stringify(state));
}

export function getActiveWatchlist(state: WatchlistsState): Watchlist | null {
  if (!state.activeId) return state.watchlists[0] ?? null;
  return state.watchlists.find((w) => w.id === state.activeId) ?? state.watchlists[0] ?? null;
}

export function createWatchlist(state: WatchlistsState, name: string): WatchlistsState {
  const trimmed = name.trim() || "Watchlist";
  const id = newId();
  return {
    watchlists: [...state.watchlists, { id, name: trimmed, symbols: [] }],
    activeId: id,
  };
}

export function renameWatchlist(state: WatchlistsState, id: string, name: string): WatchlistsState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return {
    ...state,
    watchlists: state.watchlists.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
  };
}

export function deleteWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  const next = state.watchlists.filter((w) => w.id !== id);
  if (next.length === 0) return createDefaultWatchlistsState();
  const activeId = state.activeId === id ? next[0].id : state.activeId;
  return { watchlists: next, activeId };
}

export function setActiveWatchlist(state: WatchlistsState, id: string): WatchlistsState {
  if (!state.watchlists.some((w) => w.id === id)) return state;
  return { ...state, activeId: id };
}

export type AddSymbolResult =
  | { ok: true; state: WatchlistsState; symbol: string }
  | { ok: false; error: string };

export function addSymbolToWatchlist(
  state: WatchlistsState,
  watchlistId: string,
  rawSymbol: string,
): AddSymbolResult {
  const validationError = validateTickerFormat(rawSymbol);
  if (validationError) return { ok: false, error: validationError };
  const symbol = rawSymbol.trim().toUpperCase();
  const list = state.watchlists.find((w) => w.id === watchlistId);
  if (!list) return { ok: false, error: "Watchlist not found" };
  if (list.symbols.includes(symbol)) return { ok: false, error: `${symbol} is already on this watchlist` };
  const next: WatchlistsState = {
    ...state,
    watchlists: state.watchlists.map((w) =>
      w.id === watchlistId ? { ...w, symbols: [...w.symbols, symbol] } : w,
    ),
  };
  return { ok: true, state: next, symbol };
}

export function removeSymbolFromWatchlist(
  state: WatchlistsState,
  watchlistId: string,
  symbol: string,
): WatchlistsState {
  const upper = symbol.toUpperCase();
  return {
    ...state,
    watchlists: state.watchlists.map((w) =>
      w.id === watchlistId ? { ...w, symbols: w.symbols.filter((s) => s !== upper) } : w,
    ),
  };
}
