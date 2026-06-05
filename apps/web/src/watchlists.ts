import { DEFAULT_TICKER, TICKER_MAX_LENGTH, TICKER_PATTERN } from "@stock/shared";

export interface Watchlist {
  id: string;
  name: string;
  tickers: string[];
}

export interface WatchlistState {
  watchlists: Watchlist[];
  activeWatchlistId: string;
}

type WatchlistStorage = Pick<Storage, "getItem" | "setItem">;

export const WATCHLIST_STORAGE_KEY = "stock-visualizer.watchlists.v1";
export const DEFAULT_WATCHLIST_ID = "default";
export const DEFAULT_WATCHLIST_NAME = "My Watchlist";

const TICKER_RE = new RegExp(TICKER_PATTERN);
const MAX_WATCHLIST_NAME_LENGTH = 40;

export function createDefaultWatchlistState(): WatchlistState {
  return {
    watchlists: [{ id: DEFAULT_WATCHLIST_ID, name: DEFAULT_WATCHLIST_NAME, tickers: [DEFAULT_TICKER] }],
    activeWatchlistId: DEFAULT_WATCHLIST_ID,
  };
}

export function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateTickerInput(raw: string): { ok: true; ticker: string } | { ok: false; error: string } {
  const ticker = normalizeTickerInput(raw);
  if (!ticker) return { ok: false, error: "Enter a ticker symbol." };
  if (ticker.length > TICKER_MAX_LENGTH) {
    return { ok: false, error: `Ticker must be ${TICKER_MAX_LENGTH} characters or fewer.` };
  }
  if (!TICKER_RE.test(ticker)) {
    return { ok: false, error: "Use letters, numbers, dot, underscore, caret, equals, or dash only." };
  }
  return { ok: true, ticker };
}

export function cleanWatchlistName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_WATCHLIST_NAME_LENGTH);
}

export function uniqueWatchlistName(watchlists: Watchlist[], baseName = DEFAULT_WATCHLIST_NAME): string {
  const base = cleanWatchlistName(baseName) || DEFAULT_WATCHLIST_NAME;
  const names = new Set(watchlists.map((watchlist) => watchlist.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
}

export function getActiveWatchlist(state: WatchlistState): Watchlist {
  return state.watchlists.find((watchlist) => watchlist.id === state.activeWatchlistId) ?? state.watchlists[0];
}

export function addTickerToActiveWatchlist(state: WatchlistState, ticker: string): WatchlistState {
  const normalizedTicker = normalizeTickerInput(ticker);
  return {
    ...state,
    watchlists: state.watchlists.map((watchlist) => {
      if (watchlist.id !== state.activeWatchlistId || watchlist.tickers.includes(normalizedTicker)) return watchlist;
      return { ...watchlist, tickers: [...watchlist.tickers, normalizedTicker] };
    }),
  };
}

export function removeTickerFromActiveWatchlist(state: WatchlistState, ticker: string): WatchlistState {
  const normalizedTicker = normalizeTickerInput(ticker);
  return {
    ...state,
    watchlists: state.watchlists.map((watchlist) => {
      if (watchlist.id !== state.activeWatchlistId) return watchlist;
      return { ...watchlist, tickers: watchlist.tickers.filter((item) => item !== normalizedTicker) };
    }),
  };
}

export function sanitizeWatchlistState(value: unknown): WatchlistState {
  if (!value || typeof value !== "object") return createDefaultWatchlistState();
  const candidate = value as Partial<WatchlistState>;
  if (!Array.isArray(candidate.watchlists)) return createDefaultWatchlistState();

  const seenIds = new Set<string>();
  const watchlists = candidate.watchlists.flatMap((item): Watchlist[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Partial<Watchlist>;
    if (typeof raw.id !== "string" || seenIds.has(raw.id)) return [];
    if (typeof raw.name !== "string" || !Array.isArray(raw.tickers)) return [];
    const name = cleanWatchlistName(raw.name);
    if (!name) return [];
    const tickers = raw.tickers.reduce<string[]>((acc, ticker) => {
      if (typeof ticker !== "string") return acc;
      const validated = validateTickerInput(ticker);
      if (!validated.ok || acc.includes(validated.ticker)) return acc;
      return [...acc, validated.ticker];
    }, []);
    seenIds.add(raw.id);
    return [{ id: raw.id, name, tickers }];
  });

  if (watchlists.length === 0) return createDefaultWatchlistState();
  const activeWatchlistId =
    typeof candidate.activeWatchlistId === "string" &&
    watchlists.some((watchlist) => watchlist.id === candidate.activeWatchlistId)
      ? candidate.activeWatchlistId
      : watchlists[0].id;

  return { watchlists, activeWatchlistId };
}

export function readWatchlistState(storage: WatchlistStorage): WatchlistState {
  try {
    const raw = storage.getItem(WATCHLIST_STORAGE_KEY);
    return raw ? sanitizeWatchlistState(JSON.parse(raw)) : createDefaultWatchlistState();
  } catch {
    return createDefaultWatchlistState();
  }
}

export function writeWatchlistState(storage: WatchlistStorage, state: WatchlistState): void {
  storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(state));
}
