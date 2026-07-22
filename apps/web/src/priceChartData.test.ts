import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  calculateSelectionStats,
  downsampleRows,
  filterSeriesByHorizon,
  seriesHasVolume,
  formatVolumeAxis,
  formatVolumeTooltip,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

describe("calculateSelectionStats", () => {
  const rows = [
    { t: 1, price: 100 },
    { t: 2, price: 110 },
    { t: 3, price: 105 },
    { t: 4, price: 120 },
  ];

  test("uses first and last close for either drag direction", () => {
    const expected = {
      dollarChange: 10,
      percentChange: 100 / 11,
      startPrice: 110,
      endPrice: 120,
      pointCount: 3,
    };

    expect(calculateSelectionStats(rows, 2, 4)).toEqual(expected);
    expect(calculateSelectionStats(rows, 4, 2)).toEqual(expected);
  });

  test("returns null for ranges with fewer than two points", () => {
    expect(calculateSelectionStats(rows, 2, 2)).toBeNull();
    expect(calculateSelectionStats(rows, 10, 20)).toBeNull();
  });
});

describe("filterSeriesByHorizon", () => {
  test("slices Unix-second data into distinct year windows", () => {
    const daySeconds = 24 * 60 * 60;
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 2_190,
      series: Array.from({ length: 2_191 }, (_, index) => ({
        timestamp: 1_600_000_000 + index * daySeconds,
        close: index,
        volume: null,
      })),
    };

    const oneYear = filterSeriesByHorizon(data, 365);
    const fiveYear = filterSeriesByHorizon(data, 365 * 5);

    expect(oneYear.series).toHaveLength(366);
    expect(fiveYear.series).toHaveLength(1_826);
    expect(oneYear.series[0]!.timestamp).toBe(
      data.series[data.series.length - 1]!.timestamp - 365 * daySeconds,
    );
  });
});

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
