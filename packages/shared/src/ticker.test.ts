import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKER } from "./constants";
import { isValidTicker, normalizeTicker, TICKER_MAX_LENGTH } from "./ticker";

describe("normalizeTicker", () => {
  test("trims and uppercases ticker input", () => {
    expect(normalizeTicker(" msft ")).toBe("MSFT");
  });

  test("uses DEFAULT_TICKER for empty input", () => {
    expect(normalizeTicker("   ")).toBe(DEFAULT_TICKER);
    expect(normalizeTicker(null)).toBe(DEFAULT_TICKER);
    expect(normalizeTicker(undefined)).toBe(DEFAULT_TICKER);
  });
});

describe("isValidTicker", () => {
  test("accepts supported Yahoo ticker characters", () => {
    expect(isValidTicker("AAPL")).toBe(true);
    expect(isValidTicker("BRK.B")).toBe(true);
    expect(isValidTicker("BRK_B")).toBe(true);
    expect(isValidTicker("^GSPC")).toBe(true);
    expect(isValidTicker("ABC=F")).toBe(true);
    expect(isValidTicker("BF-B")).toBe(true);
  });

  test("rejects empty, overlong, spaced, and unsupported tickers", () => {
    expect(isValidTicker("")).toBe(false);
    expect(isValidTicker("A".repeat(TICKER_MAX_LENGTH + 1))).toBe(false);
    expect(isValidTicker("BAD TICKER")).toBe(false);
    expect(isValidTicker("BAD!")).toBe(false);
    expect(isValidTicker("BAD/TICKER")).toBe(false);
  });

  test("keeps max length aligned with validation", () => {
    expect(isValidTicker("A".repeat(TICKER_MAX_LENGTH))).toBe(true);
    expect(isValidTicker("A".repeat(TICKER_MAX_LENGTH + 1))).toBe(false);
  });
});
