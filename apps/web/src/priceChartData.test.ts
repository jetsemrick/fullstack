import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  formatVolumeAxis,
  formatVolumeTooltip,
  resolveOpenPrice,
  seriesHasVolume,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

describe("seriesHasVolume", () => {
  test("false when empty", () => {
    expect(seriesHasVolume([])).toBe(false);
  });
  test("false when all null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, open: null, close: 1, volume: null },
      { timestamp: 2, open: null, close: 2, volume: null },
    ];
    expect(seriesHasVolume(s)).toBe(false);
  });
  test("true when any non-null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, open: null, close: 1, volume: null },
      { timestamp: 2, open: null, close: 2, volume: 1_000_000 },
    ];
    expect(seriesHasVolume(s)).toBe(true);
  });
});

describe("buildPriceVolumeRows", () => {
  test("maps timestamps and volumeBar", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      openPrice: 1,
      lastPrice: 10,
      series: [
        { timestamp: 1000, open: 1, close: 1.5, volume: 100 },
        { timestamp: 2000, open: 1.8, close: 2, volume: null },
      ],
    };
    const rows = buildPriceVolumeRows(data);
    expect(rows).toEqual([
      { t: 1_000_000, price: 1.5, openPrice: 1, priceAboveOpen: 1.5, priceBelowOpen: null, volume: 100, volumeBar: 100 },
      { t: 2_000_000, price: 2, openPrice: 1, priceAboveOpen: 2, priceBelowOpen: null, volume: null, volumeBar: 0 },
    ]);
  });

  test("inserts an open crossing row so red and green segments meet", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      openPrice: null,
      lastPrice: 9,
      series: [
        { timestamp: 1, open: 10, close: 9, volume: null },
        { timestamp: 3, open: 10, close: 11, volume: null },
      ],
    };
    expect(resolveOpenPrice(data)).toBe(10);
    expect(buildPriceVolumeRows(data)).toEqual([
      { t: 1000, price: 9, openPrice: 10, priceAboveOpen: null, priceBelowOpen: 9, volume: null, volumeBar: 0 },
      { t: 2000, price: 10, openPrice: 10, priceAboveOpen: 10, priceBelowOpen: 10, volume: null, volumeBar: 0 },
      { t: 3000, price: 11, openPrice: 10, priceAboveOpen: 11, priceBelowOpen: null, volume: null, volumeBar: 0 },
    ]);
  });

  test("falls back to first displayed close when upstream open is missing", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      openPrice: null,
      lastPrice: 8,
      series: [
        { timestamp: 1, open: null, close: 10, volume: null },
        { timestamp: 2, open: null, close: 8, volume: null },
      ],
    };
    expect(resolveOpenPrice(data)).toBe(10);
    expect(buildPriceVolumeRows(data).map((row) => row.priceAboveOpen)).toEqual([10, null]);
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
