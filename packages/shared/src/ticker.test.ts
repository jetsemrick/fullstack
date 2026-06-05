import { describe, expect, test } from "bun:test";
import { normalizeTicker, isValidTicker, parseTickerList } from "./ticker";

describe("normalizeTicker", () => {
  test("trims whitespace and uppercases", () => {
    expect(normalizeTicker("  aapl  ")).toBe("AAPL");
    expect(normalizeTicker("Msft")).toBe("MSFT");
  });
});

describe("isValidTicker", () => {
  test("valid tickers pass", () => {
    expect(isValidTicker("AAPL")).toBe(true);
    expect(isValidTicker("BRK.B")).toBe(true);
    expect(isValidTicker("^GSPC")).toBe(true);
    expect(isValidTicker("BTC-USD")).toBe(true);
  });

  test("invalid tickers fail", () => {
    expect(isValidTicker("")).toBe(false);
    expect(isValidTicker("!!!")).toBe(false);
    expect(isValidTicker("A".repeat(33))).toBe(false);
  });
});

describe("parseTickerList", () => {
  test("parses comma-separated tickers", () => {
    const result = parseTickerList("AAPL,MSFT,GOOG");
    expect(result.tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
    expect(result.errors).toHaveLength(0);
  });

  test("normalizes and dedupes", () => {
    const result = parseTickerList("aapl,AAPL,msft");
    expect(result.tickers).toEqual(["AAPL", "MSFT"]);
    expect(result.errors).toHaveLength(0);
  });

  test("handles whitespace", () => {
    const result = parseTickerList(" AAPL , MSFT , GOOG ");
    expect(result.tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  test("returns error for empty input", () => {
    const result = parseTickerList("");
    expect(result.tickers).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("empty");
  });

  test("returns error for whitespace-only input", () => {
    const result = parseTickerList("   ");
    expect(result.tickers).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("skips invalid tickers with error", () => {
    const result = parseTickerList("AAPL,!!!,MSFT");
    expect(result.tickers).toEqual(["AAPL", "MSFT"]);
    expect(result.errors.some((e) => e.includes("!!!"))).toBe(true);
  });

  test("limits to MAX_COMPARE_TICKERS", () => {
    const result = parseTickerList("A,B,C,D,E,F,G,H,I");
    expect(result.tickers.length).toBe(6);
    expect(result.errors.some((e) => e.includes("Too many"))).toBe(true);
  });
});
