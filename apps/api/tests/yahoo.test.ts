import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseResult } from "../src/yahoo";

describe("parseResult", () => {
  test("parses minimal Yahoo chart payload", async () => {
    const path = join(import.meta.dir, "fixtures", "minimal-chart.json");
    const raw = await Bun.file(path).text();
    const body = JSON.parse(raw) as unknown;
    const out = parseResult(body);
    expect(out.errorMessage).toBeNull();
    expect(out.currency).toBe("USD");
    expect(out.symbol).toBe("AAPL");
    expect(out.lastPrice).toBe(198.5);
    expect(out.points).toHaveLength(2);
    expect(out.points[0]).toEqual({
      timestamp: 1700000000,
      open: 197.5,
      high: 199,
      low: 197.1,
      close: 198.1,
      volume: 1000000,
    });
    expect(out.points[1]).toEqual({
      timestamp: 1700086400,
      open: 198,
      high: 199.2,
      low: 197.9,
      close: 198.5,
      volume: 1100000,
    });
  });

  test("returns error for invalid JSON shape", () => {
    const out = parseResult(null);
    expect(out.errorMessage).toBe("Invalid JSON");
    expect(out.points).toHaveLength(0);
  });

  test("returns error when chart error object present", () => {
    const out = parseResult({
      chart: { error: { description: "Invalid symbol" } },
    });
    expect(out.errorMessage).toBe("Invalid symbol");
    expect(out.points).toHaveLength(0);
  });

  test("skips bars with missing OHLC values", () => {
    const out = parseResult({
      chart: {
        result: [
          {
            meta: { currency: "USD", symbol: "MSFT" },
            timestamp: [1700000000, 1700086400, 1700172800],
            indicators: {
              quote: [
                {
                  open: [100, null, 102],
                  high: [103, 104, Number.NaN],
                  low: [99, 100, 101],
                  close: [102, 103, 102.5],
                  volume: [1000, 2000, 3000],
                },
              ],
            },
          },
        ],
        error: null,
      },
    });

    expect(out.errorMessage).toBeNull();
    expect(out.points).toEqual([
      {
        timestamp: 1700000000,
        open: 100,
        high: 103,
        low: 99,
        close: 102,
        volume: 1000,
      },
    ]);
  });

  test("returns error when OHLC arrays are missing", () => {
    const out = parseResult({
      chart: {
        result: [
          {
            meta: { currency: "USD", symbol: "MSFT" },
            timestamp: [1700000000],
            indicators: {
              quote: [{ close: [102], volume: [1000] }],
            },
          },
        ],
        error: null,
      },
    });

    expect(out.errorMessage).toBe("Malformed quote data");
    expect(out.points).toHaveLength(0);
  });
});
