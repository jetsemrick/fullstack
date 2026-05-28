import { describe, expect, test } from "bun:test";
import {
  buildCompareChartRows,
  indexedPercentSeries,
  percentFromSeriesStart,
  summarizeLoadResults,
  unionTimestamps,
} from "./compareChartData";

describe("percentFromSeriesStart", () => {
  test("returns 0 at start and positive change after", () => {
    expect(percentFromSeriesStart(100, 100)).toBe(0);
    expect(percentFromSeriesStart(110, 100)).toBe(10);
    expect(percentFromSeriesStart(90, 100)).toBe(-10);
  });
});

describe("indexedPercentSeries", () => {
  test("indexes each point vs first close", () => {
    const map = indexedPercentSeries([
      { timestamp: 1, close: 200, volume: null },
      { timestamp: 2, close: 220, volume: null },
    ]);
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(10);
  });
});

describe("unionTimestamps", () => {
  test("merges and sorts unique timestamps", () => {
    expect(
      unionTimestamps([
        [{ timestamp: 3, close: 1, volume: null }],
        [
          { timestamp: 1, close: 1, volume: null },
          { timestamp: 2, close: 1, volume: null },
        ],
      ]),
    ).toEqual([1, 2, 3]);
  });
});

describe("buildCompareChartRows", () => {
  test("aligns two tickers on shared time index", () => {
    const { rows, tickers } = buildCompareChartRows([
      {
        ticker: "A",
        series: [
          { timestamp: 10, close: 100, volume: null },
          { timestamp: 20, close: 110, volume: null },
        ],
      },
      {
        ticker: "B",
        series: [
          { timestamp: 10, close: 50, volume: null },
          { timestamp: 30, close: 60, volume: null },
        ],
      },
    ]);
    expect(tickers).toEqual(["A", "B"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ t: 10_000, A: 0, B: 0 });
    expect(rows[1]?.A).toBe(10);
    expect(rows[1]?.B).toBeUndefined();
    expect(rows[2]?.B).toBe(20);
  });
});

describe("summarizeLoadResults", () => {
  test("splits successes and failures", () => {
    const out = summarizeLoadResults([
      {
        ok: true,
        ticker: "AAPL",
        data: { ticker: "AAPL", currency: "USD", lastPrice: 1, series: [] },
      },
      { ok: false, ticker: "BAD", error: "Not found" },
    ]);
    expect(out.successes).toHaveLength(1);
    expect(out.failures).toEqual([{ ticker: "BAD", error: "Not found" }]);
  });
});
