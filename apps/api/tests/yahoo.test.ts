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
      close: 198.1,
      adjClose: null,
      volume: 1000000,
    });
    expect(out.points[1]).toEqual({
      timestamp: 1700086400,
      close: 198.5,
      adjClose: null,
      volume: 1100000,
    });
  });

  test("returns adjClose on daily points alongside the traded close", async () => {
    const path = join(import.meta.dir, "fixtures", "daily-adjclose-chart.json");
    const body = JSON.parse(await Bun.file(path).text()) as unknown;
    const out = parseResult(body);
    expect(out.errorMessage).toBeNull();
    expect(out.lastPrice).toBe(62.4);
    expect(out.points.map((p) => p.close)).toEqual([60.0, 60.5, 61.2, 62.4]);
    expect(out.points.map((p) => p.adjClose)).toEqual([59.55, 60.05, 61.2, null]);
  });

  test("drops adjclose when its length does not match the timestamps", () => {
    const out = parseResult({
      chart: {
        result: [
          {
            meta: { symbol: "KO" },
            timestamp: [1, 2],
            indicators: { quote: [{ close: [10, 11] }], adjclose: [{ adjclose: [9.5] }] },
          },
        ],
      },
    });
    expect(out.points.map((p) => p.adjClose)).toEqual([null, null]);
  });

  test("treats non-positive or non-numeric adjclose values as missing", () => {
    const out = parseResult({
      chart: {
        result: [
          {
            meta: { symbol: "KO" },
            timestamp: [1, 2, 3],
            indicators: { quote: [{ close: [10, 11, 12] }], adjclose: [{ adjclose: [0, "9", -1] }] },
          },
        ],
      },
    });
    expect(out.points.map((p) => p.adjClose)).toEqual([null, null, null]);
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
});
