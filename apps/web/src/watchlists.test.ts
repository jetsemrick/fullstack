import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WATCHLIST_ID,
  WATCHLIST_STORAGE_KEY,
  addTickerToActiveWatchlist,
  createDefaultWatchlistState,
  readWatchlistState,
  removeTickerFromActiveWatchlist,
  sanitizeWatchlistState,
  uniqueWatchlistName,
  validateTickerInput,
  writeWatchlistState,
  type WatchlistState,
} from "./watchlists";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("validateTickerInput", () => {
  test("normalizes valid ticker symbols", () => {
    expect(validateTickerInput(" msft ")).toEqual({ ok: true, ticker: "MSFT" });
    expect(validateTickerInput("^gspc")).toEqual({ ok: true, ticker: "^GSPC" });
  });

  test("rejects empty, long, or unsupported symbols", () => {
    expect(validateTickerInput("")).toEqual({ ok: false, error: "Enter a ticker symbol." });
    expect(validateTickerInput("A".repeat(33))).toEqual({
      ok: false,
      error: "Ticker must be 32 characters or fewer.",
    });
    expect(validateTickerInput("BAD!")).toEqual({
      ok: false,
      error: "Use letters, numbers, dot, underscore, caret, equals, or dash only.",
    });
  });
});

describe("watchlist state", () => {
  test("starts with a default persisted AAPL watchlist", () => {
    expect(createDefaultWatchlistState()).toEqual({
      watchlists: [{ id: DEFAULT_WATCHLIST_ID, name: "My Watchlist", tickers: ["AAPL"] }],
      activeWatchlistId: DEFAULT_WATCHLIST_ID,
    });
  });

  test("adds unique normalized tickers and removes selected tickers", () => {
    const withMsft = addTickerToActiveWatchlist(createDefaultWatchlistState(), "msft");
    const duplicate = addTickerToActiveWatchlist(withMsft, "MSFT");
    expect(duplicate.watchlists[0].tickers).toEqual(["AAPL", "MSFT"]);

    const removed = removeTickerFromActiveWatchlist(duplicate, "aapl");
    expect(removed.watchlists[0].tickers).toEqual(["MSFT"]);
  });

  test("sanitizes malformed persisted data", () => {
    const state = sanitizeWatchlistState({
      watchlists: [
        { id: "one", name: "  Tech  Stocks  ", tickers: ["msft", "MSFT", "BAD!"] },
        { id: "two", name: "", tickers: ["TSLA"] },
      ],
      activeWatchlistId: "missing",
    });

    expect(state).toEqual({
      watchlists: [{ id: "one", name: "Tech Stocks", tickers: ["MSFT"] }],
      activeWatchlistId: "one",
    });
  });

  test("reads and writes local storage state", () => {
    const storage = new MemoryStorage();
    const state: WatchlistState = {
      watchlists: [{ id: "growth", name: "Growth", tickers: ["NVDA", "TSLA"] }],
      activeWatchlistId: "growth",
    };

    writeWatchlistState(storage, state);
    expect(JSON.parse(storage.getItem(WATCHLIST_STORAGE_KEY) ?? "{}")).toEqual(state);
    expect(readWatchlistState(storage)).toEqual(state);
  });

  test("creates non-conflicting names", () => {
    expect(
      uniqueWatchlistName([
        { id: "one", name: "My Watchlist", tickers: [] },
        { id: "two", name: "My Watchlist 2", tickers: [] },
      ]),
    ).toBe("My Watchlist 3");
  });
});
