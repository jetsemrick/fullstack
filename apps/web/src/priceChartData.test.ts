import { describe, expect, test } from "bun:test";
import {
  alignSeriesOnTimestamps,
  buildIndexedCompareRows,
  buildPriceVolumeRows,
  downsampleRows,
  downsampleWideRows,
  indexSeriesTo100,
  seriesHasVolume,
  formatVolumeAxis,
  formatVolumeTooltip,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

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

describe("alignSeriesOnTimestamps", () => {
  test("merges timestamps with null gaps", () => {
    const aligned = alignSeriesOnTimestamps([
      {
        ticker: "A",
        points: [
          { timestamp: 1, close: 10 },
          { timestamp: 3, close: 30 },
        ],
      },
      {
        ticker: "B",
        points: [
          { timestamp: 2, close: 20 },
          { timestamp: 3, close: 25 },
        ],
      },
    ]);

    expect(aligned[0]?.aligned).toEqual([
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: null },
      { timestamp: 3, close: 30 },
    ]);
    expect(aligned[1]?.aligned).toEqual([
      { timestamp: 1, close: null },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 25 },
    ]);
  });
});

describe("indexSeriesTo100", () => {
  test("indexes each series from its first non-null close", () => {
    const rows = indexSeriesTo100([
      {
        ticker: "AAPL",
        aligned: [
          { timestamp: 100, close: 200 },
          { timestamp: 200, close: 220 },
        ],
      },
      {
        ticker: "MSFT",
        aligned: [
          { timestamp: 100, close: null },
          { timestamp: 200, close: 400 },
        ],
      },
    ]);

    expect(rows).toEqual([
      { t: 100_000, AAPL: 100, MSFT: null },
      { t: 200_000, AAPL: 110, MSFT: 100 },
    ]);
  });
});

describe("buildIndexedCompareRows", () => {
  test("builds indexed rows from price responses", () => {
    const responses: GetPricesResponse[] = [
      {
        ticker: "AAPL",
        currency: "USD",
        lastPrice: 110,
        series: [
          { timestamp: 1, close: 100, volume: null },
          { timestamp: 2, close: 110, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        currency: "USD",
        lastPrice: 50,
        series: [
          { timestamp: 1, close: 40, volume: null },
          { timestamp: 2, close: 50, volume: null },
        ],
      },
    ];

    expect(buildIndexedCompareRows(responses)).toEqual([
      { t: 1_000, AAPL: 100, MSFT: 100 },
      { t: 2_000, AAPL: 110, MSFT: 125 },
    ]);
  });
});

describe("downsampleWideRows", () => {
  test("preserves all ticker columns at sampled timestamps", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      t: i * 1_000,
      AAPL: 100 + i,
      MSFT: 200 + i * 2,
    }));

    const sampled = downsampleWideRows(rows, ["AAPL", "MSFT"], 4);
    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    expect(sampled.length).toBeLessThan(rows.length);
    for (const row of sampled) {
      expect(row.AAPL).toBeDefined();
      expect(row.MSFT).toBeDefined();
    }
  });
});
