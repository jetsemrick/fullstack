import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  WATCHLIST_MAX,
  WATCHLIST_STORAGE_KEY,
  addToWatchlist,
  normalizeWatchlistTicker,
  readWatchlist,
  removeFromWatchlist,
  toggleWatchlist,
  writeWatchlist,
} from "./watchlistStorage";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
}

beforeAll(() => {
  installMemoryLocalStorage();
});

afterEach(() => {
  localStorage.removeItem(WATCHLIST_STORAGE_KEY);
});

describe("normalizeWatchlistTicker", () => {
  test("uppercases and trims", () => {
    expect(normalizeWatchlistTicker("  aapl ")).toBe("AAPL");
  });

  test("rejects empty and invalid", () => {
    expect(normalizeWatchlistTicker("")).toBeNull();
    expect(normalizeWatchlistTicker("BAD TICKER")).toBeNull();
  });

  test("allows yahoo-style symbols", () => {
    expect(normalizeWatchlistTicker("^GSPC")).toBe("^GSPC");
    expect(normalizeWatchlistTicker("BRK.B")).toBe("BRK.B");
  });
});

describe("readWatchlist / writeWatchlist", () => {
  test("round-trips valid tickers", () => {
    expect(writeWatchlist(["msft", "AAPL", "msft", ""])).toEqual(["MSFT", "AAPL"]);
    expect(readWatchlist()).toEqual(["MSFT", "AAPL"]);
  });

  test("caps list length", () => {
    const many = Array.from({ length: WATCHLIST_MAX + 5 }, (_, i) => `T${i}`);
    const written = writeWatchlist(many);
    expect(written).toHaveLength(WATCHLIST_MAX);
    expect(readWatchlist()).toHaveLength(WATCHLIST_MAX);
  });

  test("returns empty on corrupt storage", () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, "{not-json");
    expect(readWatchlist()).toEqual([]);
  });
});

describe("add / remove / toggle", () => {
  test("adds to front and is idempotent", () => {
    const once = addToWatchlist(["AAPL"], "msft");
    expect(once).toEqual(["MSFT", "AAPL"]);
    expect(addToWatchlist(once, "MSFT")).toEqual(["MSFT", "AAPL"]);
  });

  test("removes when present", () => {
    expect(removeFromWatchlist(["AAPL", "MSFT"], "aapl")).toEqual(["MSFT"]);
    expect(removeFromWatchlist(["MSFT"], "AAPL")).toEqual(["MSFT"]);
  });

  test("toggle adds then removes", () => {
    const added = toggleWatchlist(["AAPL"], "nvda");
    expect(added).toEqual(["NVDA", "AAPL"]);
    expect(toggleWatchlist(added, "NVDA")).toEqual(["AAPL"]);
  });
});
