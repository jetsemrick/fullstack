import { describe, expect, test } from "bun:test";
import {
  addSymbolToWatchlist,
  createDefaultWatchlistsState,
  createWatchlist,
  deleteWatchlist,
  parseWatchlistsState,
  removeSymbolFromWatchlist,
  renameWatchlist,
} from "./watchlists";

describe("watchlists", () => {
  test("default state has one empty list", () => {
    const s = createDefaultWatchlistsState();
    expect(s.watchlists).toHaveLength(1);
    expect(s.watchlists[0].symbols).toEqual([]);
    expect(s.activeId).toBe(s.watchlists[0].id);
  });

  test("addSymbol validates format", () => {
    const s = createDefaultWatchlistsState();
    const id = s.watchlists[0].id;
    const bad = addSymbolToWatchlist(s, id, "!!!");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Invalid ticker/);
  });

  test("addSymbol uppercases and dedupes", () => {
    let s = createDefaultWatchlistsState();
    const id = s.watchlists[0].id;
    const first = addSymbolToWatchlist(s, id, "aapl");
    expect(first.ok).toBe(true);
    if (first.ok) s = first.state;
    const dup = addSymbolToWatchlist(s, id, "AAPL");
    expect(dup.ok).toBe(false);
  });

  test("rename and delete", () => {
    let s = createWatchlist(createDefaultWatchlistsState(), "Tech");
    const techId = s.activeId!;
    s = renameWatchlist(s, techId, "Growth");
    expect(s.watchlists.find((w) => w.id === techId)?.name).toBe("Growth");
    s = deleteWatchlist(s, techId);
    expect(s.watchlists.some((w) => w.id === techId)).toBe(false);
  });

  test("removeSymbol", () => {
    let s = createDefaultWatchlistsState();
    const id = s.watchlists[0].id;
    const added = addSymbolToWatchlist(s, id, "MSFT");
    if (!added.ok) throw new Error("expected add ok");
    s = added.state;
    s = removeSymbolFromWatchlist(s, id, "msft");
    expect(s.watchlists[0].symbols).toEqual([]);
  });

  test("parseWatchlistsState round-trip", () => {
    const s = createDefaultWatchlistsState();
    const raw = JSON.stringify(s);
    expect(parseWatchlistsState(raw)).toEqual(s);
    expect(parseWatchlistsState("{not json")).toBeNull();
  });
});
