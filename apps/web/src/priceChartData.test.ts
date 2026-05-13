import { describe, expect, test } from "bun:test";
import {
  buildCompareChartRows,
  buildPriceVolumeRows,
  compareCloseKey,
  compareValueKey,
  formatVolumeAxis,
  formatVolumeTooltip,
  seriesHasVolume,
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

describe("buildCompareChartRows", () => {
  test("aligns mismatched dates on one timestamp index", () => {
    const aapl: GetPricesResponse = {
      ticker: "AAPL",
      currency: "USD",
      lastPrice: 110,
      series: [
        { timestamp: 1, close: 100, volume: null },
        { timestamp: 3, close: 110, volume: null },
      ],
    };
    const msft: GetPricesResponse = {
      ticker: "MSFT",
      currency: "USD",
      lastPrice: 60,
      series: [
        { timestamp: 2, close: 50, volume: null },
        { timestamp: 3, close: 60, volume: null },
      ],
    };

    const result = buildCompareChartRows(
      [
        { id: "series0", ticker: "AAPL", color: "#f54e00", data: aapl },
        { id: "series1", ticker: "MSFT", color: "#2563eb", data: msft },
      ],
      { normalizeToFirstClose: true },
    );

    expect(result.rows.map((row) => row.t)).toEqual([1000, 2000, 3000]);
    expect(result.rows[0][compareValueKey("series0")]).toBe(100);
    expect(result.rows[1][compareValueKey("series1")]).toBe(100);
    expect(result.rows[2][compareValueKey("series0")]).toBeCloseTo(110);
    expect(result.rows[2][compareValueKey("series1")]).toBe(120);
    expect(result.rows[2][compareCloseKey("series1")]).toBe(60);
  });

  test("keeps absolute prices for a single symbol", () => {
    const data: GetPricesResponse = {
      ticker: "AAPL",
      currency: "USD",
      lastPrice: 202,
      series: [
        { timestamp: 1, close: 198, volume: null },
        { timestamp: 2, close: 202, volume: null },
      ],
    };

    const result = buildCompareChartRows(
      [{ id: "series0", ticker: "AAPL", color: "#f54e00", data }],
      { normalizeToFirstClose: false },
    );

    expect(result.rows[0][compareValueKey("series0")]).toBe(198);
    expect(result.rows[1][compareValueKey("series0")]).toBe(202);
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
