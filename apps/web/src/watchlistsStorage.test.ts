import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKER, TICKER_MAX_LENGTH } from "@stock/shared";
import {
  WATCHLISTS_STORAGE_KEY,
  addTickerToWatchlist,
  createDefaultWatchlistsState,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  getInitialTicker,
  loadWatchlistsState,
  parseWatchlistsState,
  removeTickerFromWatchlist,
  renameWatchlist,
  saveWatchlistsState,
  setActiveWatchlist,
  setLastTicker,
  type WatchlistsState,
} from "./watchlistsStorage";

class MemoryStorage implements Storage {
  private items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

function persistedState(overrides: Partial<WatchlistsState> = {}): WatchlistsState {
  return {
    version: 1,
    watchlists: [{ id: "tech", name: "Tech", tickers: ["AAPL", "MSFT"] }],
    activeWatchlistId: "tech",
    lastTicker: "MSFT",
    ...overrides,
  };
}

describe("parseWatchlistsState", () => {
  test("loads default state when no storage exists", () => {
    const state = parseWatchlistsState(null);
    expect(state.watchlists).toHaveLength(1);
    expect(state.watchlists[0]?.tickers).toEqual([DEFAULT_TICKER]);
    expect(state.lastTicker).toBe(DEFAULT_TICKER);
  });

  test("parses valid persisted state", () => {
    const state = parseWatchlistsState(JSON.stringify(persistedState()));
    expect(state.activeWatchlistId).toBe("tech");
    expect(getActiveWatchlist(state).tickers).toEqual(["AAPL", "MSFT"]);
    expect(state.lastTicker).toBe("MSFT");
  });

  test("recovers from malformed JSON and wrong versions", () => {
    expect(parseWatchlistsState("{").activeWatchlistId).toBe("default");
    expect(parseWatchlistsState(JSON.stringify({ version: 2, watchlists: [] })).activeWatchlistId).toBe("default");
  });

  test("recovers from empty watchlist arrays", () => {
    const state = parseWatchlistsState(JSON.stringify(persistedState({ watchlists: [] })));
    expect(state.watchlists).toHaveLength(1);
    expect(getActiveWatchlist(state).id).toBe("default");
  });

  test("falls back from invalid active ID and filters invalid tickers", () => {
    const state = parseWatchlistsState(
      JSON.stringify(
        persistedState({
          activeWatchlistId: "missing",
          watchlists: [{ id: "tech", name: "Tech", tickers: ["msft", "BAD!", "MSFT"] }],
          lastTicker: "BAD!",
        }),
      ),
    );
    expect(state.activeWatchlistId).toBe("tech");
    expect(getActiveWatchlist(state).tickers).toEqual(["MSFT"]);
    expect(state.lastTicker).toBeNull();
  });
});

describe("watchlist mutations", () => {
  test("creates, renames, and deletes watchlists", () => {
    const initial = createDefaultWatchlistsState();
    const created = createWatchlist(initial, "Tech", "tech");
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    expect(created.state.activeWatchlistId).toBe("tech");

    const renamed = renameWatchlist(created.state, "tech", "Growth");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error(renamed.error);
    expect(getActiveWatchlist(renamed.state).name).toBe("Growth");

    const deleted = deleteWatchlist(renamed.state, "tech");
    expect(deleted.watchlists.some((watchlist) => watchlist.id === "tech")).toBe(false);
    expect(getActiveWatchlist(deleted).id).toBe("default");
  });

  test("adds and removes tickers with normalization", () => {
    const state = createDefaultWatchlistsState();
    const result = addTickerToWatchlist(state, "default", " msft ");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(getActiveWatchlist(result.state).tickers).toContain("MSFT");

    const removed = removeTickerFromWatchlist(result.state, "default", "msft");
    expect(getActiveWatchlist(removed).tickers).not.toContain("MSFT");
  });

  test("rejects invalid, empty, overlong, and duplicate tickers", () => {
    const state = createDefaultWatchlistsState();
    expect(addTickerToWatchlist(state, "default", "").ok).toBe(false);
    expect(addTickerToWatchlist(state, "default", "BAD!").ok).toBe(false);
    expect(addTickerToWatchlist(state, "default", "A".repeat(TICKER_MAX_LENGTH + 1)).ok).toBe(false);
    expect(addTickerToWatchlist(state, "default", DEFAULT_TICKER).ok).toBe(false);
  });

  test("sets the active watchlist", () => {
    const created = createWatchlist(createDefaultWatchlistsState(), "Tech", "tech");
    if (!created.ok) throw new Error(created.error);
    const active = setActiveWatchlist(created.state, "default");
    expect(active.activeWatchlistId).toBe("default");
  });

  test("setLastTicker is a no-op when unchanged", () => {
    const state = createDefaultWatchlistsState("MSFT");
    expect(setLastTicker(state, "MSFT")).toBe(state);
    expect(setLastTicker(state, "GOOG").lastTicker).toBe("GOOG");
  });
});

describe("storage round trip", () => {
  test("persists and restores lastTicker", () => {
    const storage = new MemoryStorage();
    const state = createDefaultWatchlistsState("MSFT");
    saveWatchlistsState(state, storage);
    expect(loadWatchlistsState(storage).lastTicker).toBe("MSFT");
    expect(storage.getItem(WATCHLISTS_STORAGE_KEY)).toContain("MSFT");
  });

  test("getInitialTicker returns persisted ticker or fallback", () => {
    const storage = new MemoryStorage();
    expect(getInitialTicker(DEFAULT_TICKER, storage)).toBe(DEFAULT_TICKER);
    saveWatchlistsState(createDefaultWatchlistsState("GOOG"), storage);
    expect(getInitialTicker(DEFAULT_TICKER, storage)).toBe("GOOG");
  });
});
