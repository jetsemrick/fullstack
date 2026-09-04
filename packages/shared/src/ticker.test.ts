import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKER } from "./constants";
import { isValidTicker, normalizeTicker, TICKER_RE } from "./ticker";

describe("isValidTicker", () => {
  test("accepts common equity and Yahoo-style symbols", () => {
    expect(isValidTicker("AAPL")).toBe(true);
    expect(isValidTicker("BRK.B")).toBe(true);
    expect(isValidTicker("^GSPC")).toBe(true);
    expect(isValidTicker("ES=F")).toBe(true);
  });

  test("rejects empty, too long, and illegal characters", () => {
    expect(isValidTicker("")).toBe(false);
    expect(isValidTicker("!!!")).toBe(false);
    expect(isValidTicker("A".repeat(33))).toBe(false);
    expect(TICKER_RE.test("AAPL")).toBe(true);
  });
});

describe("normalizeTicker", () => {
  test("uppercases and trims", () => {
    expect(normalizeTicker(" aapl ")).toBe("AAPL");
  });

  test("falls back to default for empty input", () => {
    expect(normalizeTicker(null)).toBe(DEFAULT_TICKER);
    expect(normalizeTicker("")).toBe(DEFAULT_TICKER);
    expect(normalizeTicker("   ")).toBe(DEFAULT_TICKER);
  });
});
