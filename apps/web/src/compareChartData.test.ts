import { describe, expect, test } from "bun:test";
import type { GetPricesResponse } from "@stock/shared";
import {
  alignSeries,
  buildCompareRows,
  normalizeToIndex,
} from "./compareChartData";

function makeResponse(ticker: string, points: { timestamp: number; close: number }[]): GetPricesResponse {
  return {
    ticker,
    currency: "USD",
    lastPrice: points[points.length - 1]?.close ?? null,
    series: points.map((p) => ({ ...p, volume: null })),
  };
}

describe("alignSeries", () => {
  test("inner-join drops non-overlapping timestamps", () => {
    const a = makeResponse("AAPL", [
      { timestamp: 1000, close: 10 },
      { timestamp: 2000, close: 11 },
      { timestamp: 3000, close: 12 },
    ]);
    const b = makeResponse("MSFT", [
      { timestamp: 2000, close: 200 },
      { timestamp: 3000, close: 210 },
      { timestamp: 4000, close: 220 },
    ]);

    const aligned = alignSeries([a, b]);
    expect(aligned.timestamps).toEqual([2000, 3000]);
    expect(aligned.byTicker.get("AAPL")).toEqual([11, 12]);
    expect(aligned.byTicker.get("MSFT")).toEqual([200, 210]);
  });

  test("returns empty for no responses", () => {
    const aligned = alignSeries([]);
    expect(aligned.timestamps).toEqual([]);
    expect(aligned.byTicker.size).toBe(0);
  });
});

describe("normalizeToIndex", () => {
  test("rebases first value to 100", () => {
    expect(normalizeToIndex([50, 75, 100])).toEqual([100, 150, 200]);
  });

  test("handles empty input", () => {
    expect(normalizeToIndex([])).toEqual([]);
  });
});

describe("buildCompareRows", () => {
  test("single response returns absolute close prices", () => {
    const a = makeResponse("AAPL", [
      { timestamp: 1000, close: 150 },
      { timestamp: 2000, close: 155 },
    ]);
    const rows = buildCompareRows([a]);
    expect(rows).toEqual([
      { t: 1_000_000, AAPL: 150 },
      { t: 2_000_000, AAPL: 155 },
    ]);
  });

  test("two series merge with indexed normalization", () => {
    const a = makeResponse("AAPL", [
      { timestamp: 1000, close: 100 },
      { timestamp: 2000, close: 110 },
    ]);
    const b = makeResponse("MSFT", [
      { timestamp: 1000, close: 200 },
      { timestamp: 2000, close: 240 },
    ]);
    const rows = buildCompareRows([a, b], { mode: "indexed" });
    expect(rows).toEqual([
      { t: 1_000_000, AAPL: 100, MSFT: 100 },
      { t: 2_000_000, AAPL: 110, MSFT: 120 },
    ]);
  });

  test("returns empty when no overlapping dates", () => {
    const a = makeResponse("AAPL", [{ timestamp: 1000, close: 100 }]);
    const b = makeResponse("MSFT", [{ timestamp: 2000, close: 200 }]);
    expect(buildCompareRows([a, b])).toEqual([]);
  });
});
