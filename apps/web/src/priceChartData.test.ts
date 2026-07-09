import { describe, expect, test } from "bun:test";
import {
  buildOhlcChartRows,
  buildPriceVolumeRows,
  downsampleOhlcRows,
  downsampleRows,
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
      { timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: null },
      { timestamp: 2, open: 2, high: 2, low: 2, close: 2, volume: null },
    ];
    expect(seriesHasVolume(s)).toBe(false);
  });
  test("true when any non-null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: null },
      { timestamp: 2, open: 2, high: 2, low: 2, close: 2, volume: 1_000_000 },
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
        { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { timestamp: 2000, open: 1.8, high: 2.2, low: 1.7, close: 2, volume: null },
      ],
    };
    const rows = buildPriceVolumeRows(data);
    expect(rows).toEqual([
      { t: 1_000_000, price: 1.5, volume: 100, volumeBar: 100 },
      { t: 2_000_000, price: 2, volume: null, volumeBar: 0 },
    ]);
  });
});

describe("buildOhlcChartRows", () => {
  test("maps OHLC fields and candle ranges", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 10,
      series: [
        { timestamp: 1000, open: 3, high: 5, low: 2, close: 4, volume: 100 },
        { timestamp: 2000, open: 4, high: 4.5, low: 3.5, close: 3.75, volume: null },
      ],
    };

    expect(buildOhlcChartRows(data)).toEqual([
      {
        t: 1_000_000,
        price: 4,
        open: 3,
        high: 5,
        low: 2,
        close: 4,
        volume: 100,
        wickRange: [2, 5],
        bodyRange: [3, 4],
        isUp: true,
      },
      {
        t: 2_000_000,
        price: 3.75,
        open: 4,
        high: 4.5,
        low: 3.5,
        close: 3.75,
        volume: null,
        wickRange: [3.5, 4.5],
        bodyRange: [3.75, 4],
        isUp: false,
      },
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

describe("downsampleOhlcRows", () => {
  test("aggregates buckets while preserving OHLC semantics", () => {
    const rows = buildOhlcChartRows({
      ticker: "X",
      currency: "USD",
      lastPrice: 14,
      series: [
        { timestamp: 1, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
        { timestamp: 2, open: 10.5, high: 15, low: 10, close: 14, volume: 150 },
        { timestamp: 3, open: 14, high: 14.5, low: 8, close: 9, volume: null },
        { timestamp: 4, open: 9, high: 12, low: 7, close: 11, volume: 50 },
      ],
    });

    const sampled = downsampleOhlcRows(rows, 2);

    expect(sampled).toEqual([
      {
        t: 1_000,
        price: 14,
        open: 10,
        high: 15,
        low: 9,
        close: 14,
        volume: 250,
        wickRange: [9, 15],
        bodyRange: [10, 14],
        isUp: true,
      },
      {
        t: 3_000,
        price: 11,
        open: 14,
        high: 14.5,
        low: 7,
        close: 11,
        volume: 50,
        wickRange: [7, 14.5],
        bodyRange: [11, 14],
        isUp: false,
      },
    ]);
  });
});
