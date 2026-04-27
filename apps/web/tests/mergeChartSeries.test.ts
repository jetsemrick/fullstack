import { describe, expect, test } from "bun:test";
import {
  firstValidBaseClose,
  mergeTimeAlignedIndexedPercent,
  type FetchSeriesResult,
} from "../src/mergeChartSeries";

describe("firstValidBaseClose", () => {
  test("returns first positive finite close in time order", () => {
    expect(
      firstValidBaseClose([
        { timestamp: 2, close: 10, volume: null },
        { timestamp: 1, close: 5, volume: null },
      ]),
    ).toBe(5);
  });

  test("skips non-positive and non-finite", () => {
    expect(
      firstValidBaseClose([
        { timestamp: 1, close: 0, volume: null },
        { timestamp: 2, close: NaN, volume: null },
        { timestamp: 3, close: 100, volume: null },
      ]),
    ).toBe(100);
  });

  test("returns null when no valid close", () => {
    expect(firstValidBaseClose([{ timestamp: 1, close: -1, volume: null }])).toBeNull();
    expect(firstValidBaseClose([])).toBeNull();
  });
});

describe("mergeTimeAlignedIndexedPercent", () => {
  test("indexes each series to 100 at its own start and aligns by timestamp", () => {
    const results: FetchSeriesResult[] = [
      {
        ok: true,
        ticker: "A",
        series: [
          { timestamp: 100, close: 100, volume: null },
          { timestamp: 200, close: 110, volume: null },
        ],
      },
      {
        ok: true,
        ticker: "B",
        series: [
          { timestamp: 100, close: 50, volume: null },
          { timestamp: 200, close: 55, volume: null },
        ],
      },
    ];
    const { rows, tickersOnChart, failed } = mergeTimeAlignedIndexedPercent(results);
    expect(failed).toEqual([]);
    expect(tickersOnChart).toEqual(["A", "B"]);
    expect(rows.length).toBe(2);
    expect(rows[0].t).toBe(100_000);
    expect(rows[0].A).toBe(100);
    expect(rows[0].B).toBe(100);
    expect(rows[1].A).toBeCloseTo(110, 5);
    expect(rows[1].B).toBeCloseTo(110, 5);
  });

  test("records failed fetches and still merges successful symbols", () => {
    const results: FetchSeriesResult[] = [
      { ok: false, ticker: "BAD", error: "not found" },
      {
        ok: true,
        ticker: "GOOD",
        series: [{ timestamp: 1, close: 10, volume: null }],
      },
    ];
    const { rows, tickersOnChart, failed } = mergeTimeAlignedIndexedPercent(results);
    expect(failed).toEqual([{ ticker: "BAD", error: "not found" }]);
    expect(tickersOnChart).toEqual(["GOOD"]);
    expect(rows.length).toBe(1);
    expect(rows[0].GOOD).toBe(100);
  });

  test("null when a symbol has no bar on a date", () => {
    const results: FetchSeriesResult[] = [
      {
        ok: true,
        ticker: "A",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 20, volume: null },
        ],
      },
      {
        ok: true,
        ticker: "B",
        series: [{ timestamp: 2, close: 40, volume: null }],
      },
    ];
    const { rows } = mergeTimeAlignedIndexedPercent(results);
    const r0 = rows.find((r) => r.t === 1000);
    const r1 = rows.find((r) => r.t === 2000);
    expect(r0?.A).toBe(100);
    expect(r0?.B).toBeNull();
    expect(r1?.A).toBe(200);
    expect(r1?.B).toBe(100);
  });
});
