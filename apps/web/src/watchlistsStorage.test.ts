import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKER, TICKER_MAX_LENGTH } from "@stock/shared";
import {
  WATCHLISTS_STORAGE_KEY,
  addTickerToActiveWatchlist,
  createWatchlist,
  deleteWatchlist,
  emptyWatchlistsState,
  getActiveWatchlist,
  parseWatchlistsState,
  removeTickerFromWatchlist,
  renameWatchlist,
  saveWatchlistsState,
  serializeWatchlistsState,
  setActiveWatchlist,
  setLastTicker,
  type WatchlistsState,
} from "./watchlistsStorage";

function seededState(): WatchlistsState {
  return {
    watchlists: [
      { id: "one", name: "Core", tickers: ["AAPL"] },
      { id: "two", name: "Growth", tickers: ["MSFT"] },
    ],
    activeWatchlistId: "one",
    lastTicker: "AAPL",
  };
}

describe("parseWatchlistsState", () => {
  test("returns defaults for empty or invalid payloads", () => {
    expect(parseWatchlistsState(null)).toEqual(emptyWatchlistsState());
    expect(parseWatchlistsState("not-json")).toEqual(emptyWatchlistsState());
    expect(parseWatchlistsState(JSON.stringify({ version: 2 }))).toEqual(emptyWatchlistsState());
  });

  test("normalizes stored names, tickers, active watchlist, and last ticker", () => {
    const parsed = parseWatchlistsState(JSON.stringify({
      version: 1,
      watchlists: [
        { id: "a", name: "  My   List  ", tickers: ["aapl", "AAPL", "bad!", "", "msft"] },
      ],
      activeWatchlistId: "missing",
      lastTicker: "goog",
    }));

    expect(parsed).toEqual({
      watchlists: [{ id: "a", name: "My List", tickers: ["AAPL", "MSFT"] }],
      activeWatchlistId: "a",
      lastTicker: "GOOG",
    });
  });

  test("falls back to default ticker for invalid persisted last ticker", () => {
    const parsed = parseWatchlistsState(JSON.stringify({
      version: 1,
      watchlists: [],
      activeWatchlistId: null,
      lastTicker: "!".repeat(TICKER_MAX_LENGTH + 1),
    }));

    expect(parsed.lastTicker).toBe(DEFAULT_TICKER);
  });
});

describe("watchlist mutations", () => {
  test("creates, renames, switches, and deletes watchlists", () => {
    const created = createWatchlist(emptyWatchlistsState(), "  Tech  Ideas ");
    const active = getActiveWatchlist(created);
    expect(active?.name).toBe("Tech Ideas");
    expect(created.activeWatchlistId).toBe(active?.id);

    const renamed = renameWatchlist(created, active!.id, "  Blue Chips ");
    expect(getActiveWatchlist(renamed)?.name).toBe("Blue Chips");

    const second = createWatchlist(renamed, "Growth");
    const switched = setActiveWatchlist(second, renamed.activeWatchlistId!);
    expect(getActiveWatchlist(switched)?.name).toBe("Blue Chips");

    const deleted = deleteWatchlist(switched, renamed.activeWatchlistId!);
    expect(getActiveWatchlist(deleted)?.name).toBe("Growth");
  });

  test("adds uppercase tickers, rejects invalid and duplicate tickers, and removes tickers", () => {
    const state = createWatchlist(emptyWatchlistsState(), "Tech");
    const added = addTickerToActiveWatchlist(state, " msft ");
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error("expected add to succeed");
    expect(getActiveWatchlist(added.state)?.tickers).toEqual(["MSFT"]);
    expect(added.state.lastTicker).toBe("MSFT");

    const duplicate = addTickerToActiveWatchlist(added.state, "MSFT");
    expect(duplicate.ok).toBe(false);

    const invalid = addTickerToActiveWatchlist(added.state, "BAD!");
    expect(invalid.ok).toBe(false);

    const removed = removeTickerFromWatchlist(added.state, added.state.activeWatchlistId!, "MSFT");
    expect(getActiveWatchlist(removed)?.tickers).toEqual([]);
  });

  test("rejects adding without an active watchlist", () => {
    const result = addTickerToActiveWatchlist(emptyWatchlistsState(), "AAPL");
    expect(result.ok).toBe(false);
  });

  test("setLastTicker ignores invalid values", () => {
    expect(setLastTicker(seededState(), "nvda").lastTicker).toBe("NVDA");
    expect(setLastTicker(seededState(), "!!!").lastTicker).toBe(DEFAULT_TICKER);
  });
});

describe("watchlist persistence", () => {
  test("serializes and saves with the versioned key", () => {
    const storage = new Map<string, string>();
    const adapter = {
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    };
    const state = seededState();

    saveWatchlistsState(state, adapter);

    expect(storage.get(WATCHLISTS_STORAGE_KEY)).toBe(serializeWatchlistsState(state));
  });
});
