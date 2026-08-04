import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  calculateRangeSelection,
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

describe("calculateRangeSelection", () => {
  const rows = [
    { t: 10, price: 100 },
    { t: 20, price: 125 },
    { t: 30, price: 90 },
    { t: 40, price: 90 },
    { t: 50, price: 110 },
  ];

  test("calculates a positive change for left-to-right selection", () => {
    expect(calculateRangeSelection(rows, 10, 20)).toEqual({
      startTime: 10,
      endTime: 20,
      startPrice: 100,
      endPrice: 125,
      change: 25,
      percentChange: 25,
    });
  });

  test("calculates a negative change for right-to-left selection", () => {
    expect(calculateRangeSelection(rows, 30, 20)).toEqual({
      startTime: 20,
      endTime: 30,
      startPrice: 125,
      endPrice: 90,
      change: -35,
      percentChange: -28,
    });
  });

  test("calculates a flat change when prices are unchanged", () => {
    expect(calculateRangeSelection(rows, 30, 40)).toEqual({
      startTime: 30,
      endTime: 40,
      startPrice: 90,
      endPrice: 90,
      change: 0,
      percentChange: 0,
    });
  });

  test("returns null when fewer than two points are selected", () => {
    expect(calculateRangeSelection(rows, 15, 25)).toBeNull();
    expect(calculateRangeSelection(rows, 55, 60)).toBeNull();
  });

  test("uses the first and last closes inside the selected boundaries", () => {
    expect(calculateRangeSelection(rows, 15, 45)).toEqual({
      startTime: 20,
      endTime: 40,
      startPrice: 125,
      endPrice: 90,
      change: -35,
      percentChange: -28,
    });
  });

  test("returns null when the starting price is zero", () => {
    expect(
      calculateRangeSelection(
        [
          { t: 1, price: 0 },
          { t: 2, price: 10 },
        ],
        1,
        2,
      ),
    ).toBeNull();
  });
});
