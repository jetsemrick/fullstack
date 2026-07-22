import { describe, expect, test } from "bun:test";
import {
  alignAndIndexSeries,
  buildPriceVolumeRows,
  downsampleMultiRows,
  downsampleRows,
  seriesHasVolume,
  formatVolumeAxis,
  formatVolumeTooltip,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

function makeSeries(ticker: string, points: Array<[number, number]>): GetPricesResponse {
  return {
    ticker,
    currency: "USD",
    lastPrice: points.at(-1)?.[1] ?? null,
    series: points.map(([timestamp, close]) => ({
      timestamp,
      close,
      volume: null,
    })),
  };
}

describe("seriesHasVolume", () => {
  test("false when empty", () => {
    expect(seriesHasVolume([])).toBe(false);
  });
  test("false when all null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, volume: null },
      { timestamp: 2, close: 2, volume: null },
    ];
    expect(seriesHasVolume(s)).toBe(false);
  });
  test("true when any non-null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, volume: null },
      { timestamp: 2, close: 2, volume: 1_000_000 },
    ];
    expect(seriesHasVolume(s)).toBe(true);
  });
});

describe("buildPriceVolumeRows", () => {
  test("maps timestamps and volumeBar", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 10,
      series: [
        { timestamp: 1000, close: 1.5, volume: 100 },
        { timestamp: 2000, close: 2, volume: null },
      ],
    };
    const rows = buildPriceVolumeRows(data);
    expect(rows).toEqual([
      { t: 1_000_000, price: 1.5, volume: 100, volumeBar: 100 },
      { t: 2_000_000, price: 2, volume: null, volumeBar: 0 },
    ]);
  });
});

describe("formatVolumeAxis", () => {
  test("compact suffixes", () => {
    expect(formatVolumeAxis(500)).toBe("500");
    expect(formatVolumeAxis(12_000)).toBe("12.0K");
    expect(formatVolumeAxis(3_400_000)).toBe("3.4M");
    expect(formatVolumeAxis(2_200_000_000)).toBe("2.2B");
  });
});

describe("formatVolumeTooltip", () => {
  test("em dash for null", () => {
    expect(formatVolumeTooltip(null)).toBe("—");
  });
  test("includes digits for finite values", () => {
    expect(formatVolumeTooltip(1_234_567)).toMatch(/1.*234.*567/);
  });
});

describe("downsampleRows", () => {
  test("preserves endpoints and bucket extrema", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      t: i,
      price: i === 5 ? 100 : i === 14 ? -10 : i,
    }));

    const sampled = downsampleRows(rows, 6);

    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    expect(sampled).toContainEqual(rows[5]);
    expect(sampled).toContainEqual(rows[14]);
    expect(sampled.length).toBeLessThan(rows.length);
  });
});

describe("alignAndIndexSeries", () => {
  test("outer-joins timestamps across tickers", () => {
    const aapl = makeSeries("AAPL", [
      [1_000, 100],
      [2_000, 110],
    ]);
    const msft = makeSeries("MSFT", [
      [1_500, 200],
      [2_000, 220],
    ]);

    const { rows, tickers } = alignAndIndexSeries([aapl, msft], "absolute");

    expect(tickers).toEqual(["AAPL", "MSFT"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ t: 1_000_000, AAPL: 100 });
    expect(rows[1]).toEqual({ t: 1_500_000, MSFT: 200 });
    expect(rows[2]).toEqual({ t: 2_000_000, AAPL: 110, MSFT: 220 });
  });

  test("indexes each series to 100 at its first point", () => {
    const aapl = makeSeries("AAPL", [
      [1_000, 100],
      [2_000, 120],
    ]);
    const msft = makeSeries("MSFT", [
      [1_000, 50],
      [2_000, 75],
    ]);

    const { rows } = alignAndIndexSeries([aapl, msft], "indexed");

    expect(rows[0]).toEqual({ t: 1_000_000, AAPL: 100, MSFT: 100 });
    expect(rows[1]).toEqual({ t: 2_000_000, AAPL: 120, MSFT: 150 });
  });

  test("skips empty series", () => {
    const empty = makeSeries("EMPTY", []);
    const aapl = makeSeries("AAPL", [[1_000, 100]]);

    const { rows, tickers } = alignAndIndexSeries([empty, aapl], "absolute");

    expect(tickers).toEqual(["EMPTY", "AAPL"]);
    expect(rows).toEqual([{ t: 1_000_000, AAPL: 100 }]);
  });
});

describe("downsampleMultiRows", () => {
  test("preserves all ticker values at sampled timestamps", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      t: i * 1_000,
      AAPL: i,
      MSFT: i * 2,
    }));

    const sampled = downsampleMultiRows(rows, ["AAPL", "MSFT"], 6);

    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    expect(sampled.length).toBeLessThan(rows.length);
    for (const row of sampled) {
      expect(row.AAPL).toBeDefined();
      expect(row.MSFT).toBe(row.AAPL! * 2);
    }
  });
});
