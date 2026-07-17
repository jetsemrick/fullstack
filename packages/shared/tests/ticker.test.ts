import { describe, expect, test } from "bun:test";
import { DEFAULT_TICKER, normalizeTicker } from "../src/index";

describe("normalizeTicker", () => {
  test.each([
    ["MSFT", "MSFT"],
    ["GOOGL", "GOOGL"],
    ["BRK.B", "BRK.B"],
    [" msft ", "MSFT"],
    ["googl\t", "GOOGL"],
  ])("preserves character order while trimming and uppercasing %p", (input, expected) => {
    expect(normalizeTicker(input)).toBe(expected);
  });

  test.each([null, undefined, "", "   "])("falls back to the default ticker for blank input %p", (input) => {
    expect(normalizeTicker(input)).toBe(DEFAULT_TICKER);
  });
});
