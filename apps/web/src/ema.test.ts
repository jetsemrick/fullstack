import { describe, expect, test } from "bun:test";
import {
  buildChartRowsWithEma,
  computeEma,
  detectEmaCrossovers,
  EMA_LONG_PERIOD,
} from "./ema";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

function seriesFromCloses(closes: number[], startTs = 1_700_000_000): PricePoint[] {
  return closes.map((close, i) => ({
    timestamp: startTs + i * 86_400,
    close,
    volume: null,
  }));
}

describe("computeEma", () => {
  test("returns nulls until period is filled", () => {
    const ema = computeEma([1, 2, 3, 4, 5], 3);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBeNull();
    expect(ema[2]).toBe(2);
    expect(ema[3]).not.toBeNull();
    expect(ema[4]).not.toBeNull();
  });

  test("empty input yields empty output", () => {
    expect(computeEma([], 50)).toEqual([]);
  });
});

describe("detectEmaCrossovers", () => {
  test("detects golden cross when EMA50 crosses above EMA200", () => {
    const series = seriesFromCloses([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const ema50 = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    const ema200 = [2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
    const crossovers = detectEmaCrossovers(series, ema50, ema200);
    expect(crossovers).toHaveLength(1);
    expect(crossovers[0]?.type).toBe("golden");
    expect(crossovers[0]?.timestamp).toBe(series[5]!.timestamp);
  });

  test("detects death cross when EMA50 crosses below EMA200", () => {
    const series = seriesFromCloses([10, 10, 10, 10, 10]);
    const ema50 = [2, 2, 2, 1, 1];
    const ema200 = [1, 1, 1, 2, 2];
    const crossovers = detectEmaCrossovers(series, ema50, ema200);
    expect(crossovers).toHaveLength(1);
    expect(crossovers[0]?.type).toBe("death");
  });
});

describe("buildChartRowsWithEma", () => {
  test("aligns EMA from longer source onto shorter display window", () => {
    const longCloses = Array.from({ length: 220 }, (_, i) => 100 + i * 0.1);
    const source: GetPricesResponse = {
      ticker: "TEST",
      currency: "USD",
      lastPrice: longCloses.at(-1)!,
      series: seriesFromCloses(longCloses, 1_000_000),
    };
    const display: GetPricesResponse = {
      ...source,
      series: source.series.slice(-30),
    };
    const { rows, crossovers } = buildChartRowsWithEma(display, source);
    expect(rows).toHaveLength(30);
    expect(rows.every((r) => r.ema50 != null || r.ema200 != null)).toBe(true);
    expect(rows[rows.length - 1]?.ema50).not.toBeNull();
    expect(rows[rows.length - 1]?.ema200).not.toBeNull();
    expect(Array.isArray(crossovers)).toBe(true);
  });

  test("needs enough bars for EMA200 on display-only short series", () => {
    const short: GetPricesResponse = {
      ticker: "X",
      currency: null,
      lastPrice: 1,
      series: seriesFromCloses(Array.from({ length: 100 }, () => 50)),
    };
    const { rows } = buildChartRowsWithEma(short);
    expect(rows[0]?.ema200).toBeNull();
    expect(rows[99]?.ema200).toBeNull();
  });

  test("produces EMA200 when source has 200+ points", () => {
    const closes = Array.from({ length: EMA_LONG_PERIOD + 20 }, (_, i) => 80 + Math.sin(i / 10) * 5);
    const data: GetPricesResponse = {
      ticker: "X",
      currency: null,
      lastPrice: closes.at(-1)!,
      series: seriesFromCloses(closes),
    };
    const { rows } = buildChartRowsWithEma(data);
    const last = rows[rows.length - 1];
    expect(last?.ema50).not.toBeNull();
    expect(last?.ema200).not.toBeNull();
  });
});
