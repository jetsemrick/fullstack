import { describe, expect, test } from "bun:test";
import { normalizeTicker, validateTickerFormat } from "./ticker";

describe("normalizeTicker", () => {
  test("returns default for empty input", () => {
    expect(normalizeTicker("")).toBe("AAPL");
    expect(normalizeTicker(null)).toBe("AAPL");
  });

  test("uppercases and trims", () => {
    expect(normalizeTicker("  msft ")).toBe("MSFT");
  });
});

describe("validateTickerFormat", () => {
  test("accepts valid symbols", () => {
    expect(validateTickerFormat("AAPL")).toBeNull();
    expect(validateTickerFormat("BRK.B")).toBeNull();
  });

  test("rejects invalid characters", () => {
    expect(validateTickerFormat("!!!")).toMatch(/Invalid ticker/);
  });

  test("rejects empty", () => {
    expect(validateTickerFormat("   ")).toMatch(/required/i);
  });
});
