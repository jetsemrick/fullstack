import { describe, expect, test } from "bun:test";
import {
  STORAGE_KEY,
  addTicker,
  createWatchlist,
  deleteWatchlist,
  emptyState,
  getActiveWatchlist,
  initialState,
  loadState,
  parseState,
  removeTicker,
  renameWatchlist,
  saveState,
  setActiveWatchlist,
  setLastTicker,
} from "./watchlistsStorage";

/** In-memory `Storage` shim so storage tests do not require a real DOM. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
}

describe("parseState", () => {
  test("returns empty state for null/garbage input", () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState("not json")).toEqual(emptyState());
    expect(parseState("123")).toEqual(emptyState());
  });

  test("discards mismatched schema version", () => {
    const s = parseState(JSON.stringify({ version: 99, watchlists: [] }));
    expect(s).toEqual(emptyState());
  });

  test("normalizes tickers and de-duplicates", () => {
    const raw = JSON.stringify({
      version: 1,
      watchlists: [
        { id: "a", name: "Tech", tickers: ["aapl", "AAPL", " msft ", "bad!ticker"] },
      ],
      activeId: "a",
      lastTicker: "aapl",
    });
    const s = parseState(raw);
    expect(s.watchlists[0]?.tickers).toEqual(["AAPL", "MSFT"]);
    expect(s.activeId).toBe("a");
    expect(s.lastTicker).toBe("AAPL");
  });
});

describe("createWatchlist / renameWatchlist / deleteWatchlist", () => {
  test("createWatchlist makes it the active list", () => {
    const s = createWatchlist(emptyState(), "Tech");
    expect(s.watchlists.length).toBe(1);
    expect(s.watchlists[0]?.name).toBe("Tech");
    expect(s.activeId).toBe(s.watchlists[0]?.id);
  });

  test("renameWatchlist ignores empty names", () => {
    const a = createWatchlist(emptyState(), "Tech");
    const id = a.watchlists[0]!.id;
    const b = renameWatchlist(a, id, "   ");
    expect(b.watchlists[0]?.name).toBe("Tech");
    const c = renameWatchlist(a, id, "Cloud");
    expect(c.watchlists[0]?.name).toBe("Cloud");
  });

  test("deleteWatchlist updates activeId to the next list", () => {
    let s = createWatchlist(emptyState(), "A");
    s = createWatchlist(s, "B");
    const aId = s.watchlists[0]!.id;
    const bId = s.watchlists[1]!.id;
    s = setActiveWatchlist(s, aId);
    s = deleteWatchlist(s, aId);
    expect(s.watchlists.map((l) => l.id)).toEqual([bId]);
    expect(s.activeId).toBe(bId);
  });
});

describe("addTicker / removeTicker", () => {
  function seeded() {
    return createWatchlist(emptyState(), "Tech");
  }

  test("normalizes and adds valid ticker", () => {
    const s = seeded();
    const id = s.watchlists[0]!.id;
    const { state, result } = addTicker(s, id, "aapl");
    expect(result).toEqual({ ok: true, ticker: "AAPL" });
    expect(state.watchlists[0]?.tickers).toEqual(["AAPL"]);
  });

  test("rejects invalid characters", () => {
    const s = seeded();
    const id = s.watchlists[0]!.id;
    const { result } = addTicker(s, id, "AA PL");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid");
  });

  test("rejects empty input", () => {
    const s = seeded();
    const id = s.watchlists[0]!.id;
    const { result } = addTicker(s, id, "   ");
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("invalid");
  });

  test("rejects overlong input", () => {
    const s = seeded();
    const id = s.watchlists[0]!.id;
    const { result } = addTicker(s, id, "A".repeat(40));
    if (result.ok) throw new Error("expected failure");
    expect(result.reason).toBe("invalid");
  });

  test("rejects duplicate ticker", () => {
    let s = seeded();
    const id = s.watchlists[0]!.id;
    s = addTicker(s, id, "AAPL").state;
    const { result } = addTicker(s, id, "aapl");
    if (result.ok) throw new Error("expected duplicate failure");
    expect(result.reason).toBe("duplicate");
  });

  test("removeTicker drops the canonical form", () => {
    let s = seeded();
    const id = s.watchlists[0]!.id;
    s = addTicker(s, id, "AAPL").state;
    s = addTicker(s, id, "MSFT").state;
    s = removeTicker(s, id, "aapl");
    expect(s.watchlists[0]?.tickers).toEqual(["MSFT"]);
  });
});

describe("setLastTicker", () => {
  test("ignores invalid tickers", () => {
    const s = setLastTicker(emptyState(), "bad!ticker");
    expect(s.lastTicker).toBeNull();
  });

  test("stores uppercased valid ticker", () => {
    const s = setLastTicker(emptyState(), "aapl");
    expect(s.lastTicker).toBe("AAPL");
  });
});

describe("loadState / saveState round-trip", () => {
  test("roundtrips through a Storage shim", () => {
    const storage = memoryStorage();
    const seeded = initialState();
    saveState(seeded, storage);
    const reloaded = loadState(storage);
    expect(reloaded.watchlists.length).toBe(1);
    expect(reloaded.watchlists[0]?.tickers).toEqual(["AAPL"]);
    expect(reloaded.activeId).toBe(seeded.activeId);
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe("getActiveWatchlist", () => {
  test("returns null when no active id", () => {
    expect(getActiveWatchlist(emptyState())).toBeNull();
  });

  test("returns the active watchlist", () => {
    const s = createWatchlist(emptyState(), "Tech");
    const active = getActiveWatchlist(s);
    expect(active?.name).toBe("Tech");
  });
});
