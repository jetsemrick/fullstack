import { describe, expect, test } from "bun:test";
import {
  addWatchlistTicker,
  loadWatchlist,
  parseWatchlistJson,
  removeWatchlistTicker,
  saveWatchlist,
  serializeWatchlist,
  WATCHLIST_MAX,
  WATCHLIST_STORAGE_KEY,
  type WatchlistStorage,
} from "./watchlistStorage";

function memoryStorage(initial?: Record<string, string>): WatchlistStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("parseWatchlistJson", () => {
  test("returns empty for null, garbage, and wrong shape", () => {
    expect(parseWatchlistJson(null)).toEqual([]);
    expect(parseWatchlistJson("not-json")).toEqual([]);
    expect(parseWatchlistJson("[]")).toEqual([]);
    expect(parseWatchlistJson(JSON.stringify({ version: 1 }))).toEqual([]);
    expect(parseWatchlistJson(JSON.stringify({ version: 2, tickers: ["AAPL"] }))).toEqual([]);
  });

  test("keeps unique valid tickers and drops invalid ones", () => {
    expect(
      parseWatchlistJson(
        JSON.stringify({ version: 1, tickers: ["aapl", "AAPL", "!!!", "MSFT", 12, "BRK.B"] }),
      ),
    ).toEqual(["AAPL", "MSFT", "BRK.B"]);
  });

  test("caps at WATCHLIST_MAX", () => {
    const tickers = Array.from({ length: WATCHLIST_MAX + 5 }, (_, i) => `T${i}`);
    expect(parseWatchlistJson(JSON.stringify({ version: 1, tickers })).length).toBe(WATCHLIST_MAX);
  });
});

describe("addWatchlistTicker", () => {
  test("adds a new ticker", () => {
    expect(addWatchlistTicker([], " nvda ")).toEqual({ ok: true, tickers: ["NVDA"] });
  });

  test("blocks duplicates", () => {
    expect(addWatchlistTicker(["NVDA"], "nvda")).toEqual({
      ok: false,
      reason: "duplicate",
      tickers: ["NVDA"],
    });
  });

  test("blocks invalid symbols", () => {
    expect(addWatchlistTicker([], "!!!")).toEqual({ ok: false, reason: "invalid", tickers: [] });
  });

  test("blocks when full without dropping existing items", () => {
    const full = Array.from({ length: WATCHLIST_MAX }, (_, i) => `T${i}`);
    expect(addWatchlistTicker(full, "NVDA")).toEqual({
      ok: false,
      reason: "full",
      tickers: full,
    });
  });
});

describe("removeWatchlistTicker", () => {
  test("removes a matching ticker and leaves others", () => {
    expect(removeWatchlistTicker(["AAPL", "MSFT"], "aapl")).toEqual(["MSFT"]);
  });
});

describe("loadWatchlist / saveWatchlist", () => {
  test("round-trips through storage", () => {
    const storage = memoryStorage();
    saveWatchlist(["msft", "aapl"], storage);
    expect(JSON.parse(storage.getItem(WATCHLIST_STORAGE_KEY) ?? "")).toEqual({
      version: 1,
      tickers: ["MSFT", "AAPL"],
    });
    expect(loadWatchlist(storage)).toEqual(["MSFT", "AAPL"]);
  });

  test("resets corrupt JSON instead of throwing", () => {
    const storage = memoryStorage({ [WATCHLIST_STORAGE_KEY]: "{not json" });
    expect(loadWatchlist(storage)).toEqual([]);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe(serializeWatchlist([]));
  });

  test("returns empty when storage is missing", () => {
    expect(loadWatchlist(null)).toEqual([]);
  });
});
