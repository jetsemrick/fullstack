import { describe, expect, test } from "bun:test";
import type { GetPricesResponse } from "@stock/shared";
import {
  alignSeriesByDay,
  applyNormalization,
  buildCompareChartRows,
  utcDayMs,
} from "./compareChartData";

function makeResponse(ticker: string, points: { day: string; close: number }[]): GetPricesResponse {
  return {
    ticker,
    currency: "USD",
    lastPrice: points[points.length - 1]?.close ?? null,
    series: points.map((p) => ({
      timestamp: Math.floor(new Date(`${p.day}T12:00:00Z`).getTime() / 1000),
      close: p.close,
      volume: null,
    })),
  };
}

describe("utcDayMs", () => {
  test("floors to UTC calendar day", () => {
    const ts = Math.floor(new Date("2024-06-15T18:30:00Z").getTime() / 1000);
    expect(utcDayMs(ts)).toBe(Date.UTC(2024, 5, 15));
  });
});

describe("alignSeriesByDay", () => {
  test("outer-joins mismatched date lengths", () => {
    const a = makeResponse("AAPL", [
      { day: "2024-01-01", close: 100 },
      { day: "2024-01-02", close: 110 },
      { day: "2024-01-03", close: 105 },
    ]);
    const b = makeResponse("MSFT", [
      { day: "2024-01-02", close: 200 },
      { day: "2024-01-03", close: 220 },
    ]);
    const { rows, tickers } = alignSeriesByDay([a, b]);
    expect(tickers).toEqual(["AAPL", "MSFT"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.AAPL).toBe(100);
    expect(rows[0]!.MSFT).toBeUndefined();
    expect(rows[1]!.AAPL).toBe(110);
    expect(rows[1]!.MSFT).toBe(200);
  });

  test("returns empty rows for empty input", () => {
    expect(alignSeriesByDay([])).toEqual({ rows: [], tickers: [] });
  });
});

describe("applyNormalization", () => {
  test("indexed mode rebases each series to 100 at first point", () => {
    const rows = [
      { t: 1, AAPL: 100, MSFT: 50 },
      { t: 2, AAPL: 110, MSFT: 55 },
    ];
    const normalized = applyNormalization(rows, ["AAPL", "MSFT"], "indexed");
    expect(normalized[0]!.AAPL).toBe(100);
    expect(normalized[0]!.MSFT).toBe(100);
    expect(normalized[1]!.AAPL).toBeCloseTo(110, 5);
    expect(normalized[1]!.MSFT).toBeCloseTo(110, 5);
  });

  test("absolute mode leaves values unchanged", () => {
    const rows = [{ t: 1, AAPL: 100 }];
    expect(applyNormalization(rows, ["AAPL"], "absolute")).toEqual(rows);
  });

  test("handles single point series", () => {
    const rows = [{ t: 1, AAPL: 42 }];
    const normalized = applyNormalization(rows, ["AAPL"], "indexed");
    expect(normalized[0]!.AAPL).toBe(100);
  });
});

describe("buildCompareChartRows", () => {
  test("aligns then normalizes", () => {
    const a = makeResponse("AAPL", [{ day: "2024-01-01", close: 200 }]);
    const b = makeResponse("MSFT", [{ day: "2024-01-01", close: 400 }]);
    const { rows, tickers } = buildCompareChartRows([a, b], "indexed");
    expect(tickers).toEqual(["AAPL", "MSFT"]);
    expect(rows[0]!.AAPL).toBe(100);
    expect(rows[0]!.MSFT).toBe(100);
  });
});
