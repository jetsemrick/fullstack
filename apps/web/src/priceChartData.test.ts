import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  computeRangeChange,
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

describe("computeRangeChange", () => {
  const rows = [
    { t: 1000, price: 100 },
    { t: 2000, price: 110 },
    { t: 3000, price: 105 },
    { t: 4000, price: 120 },
  ];

  test("forward drag uses first and last close in window", () => {
    const r = computeRangeChange(rows, 1000, 4000);
    expect(r).not.toBeNull();
    expect(r!.startPrice).toBe(100);
    expect(r!.endPrice).toBe(120);
    expect(r!.diff).toBe(20);
    expect(r!.pct).toBe(20);
  });

  test("reversed drag same as forward", () => {
    expect(computeRangeChange(rows, 4000, 1000)).toEqual(computeRangeChange(rows, 1000, 4000));
  });

  test("fewer than two points returns null", () => {
    expect(computeRangeChange(rows, 1000, 1000)).toBeNull();
    expect(computeRangeChange([{ t: 1, price: 1 }], 0, 10)).toBeNull();
  });

  test("flat change", () => {
    const r = computeRangeChange(rows, 1000, 2000);
    expect(r!.diff).toBe(10);
    expect(r!.pct).toBe(10);
  });

  test("zero start price returns null", () => {
    expect(computeRangeChange([{ t: 1, price: 0 }, { t: 2, price: 1 }], 1, 2)).toBeNull();
  });

  test("includes points at range edges only", () => {
    const r = computeRangeChange(rows, 2000, 3000);
    expect(r!.startPrice).toBe(110);
    expect(r!.endPrice).toBe(105);
    expect(r!.diff).toBe(-5);
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
