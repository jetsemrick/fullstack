import { describe, expect, test } from "bun:test";
import { buildPriceVolumeRows, downsampleRows, filterSeriesByHorizon, seriesHasVolume, formatVolumeAxis, formatVolumeTooltip } from "./priceChartData";
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

describe("filterSeriesByHorizon", () => {
  const day = 24 * 60 * 60;
  const data: GetPricesResponse = {
    ticker: "X",
    currency: "USD",
    lastPrice: 40,
    series: [
      { timestamp: day, close: 10, volume: null },
      { timestamp: 2 * day, close: 20, volume: null },
      { timestamp: 3 * day, close: 30, volume: null },
      { timestamp: 4 * day, close: 40, volume: null },
    ],
  };

  test("filters second-based timestamps by selected day horizon", () => {
    const filtered = filterSeriesByHorizon(data, 2);

    expect(filtered.series.map((point) => point.timestamp)).toEqual([2 * day, 3 * day, 4 * day]);
  });

  test("returns all points for all-time horizon", () => {
    expect(filterSeriesByHorizon(data, Infinity)).toBe(data);
  });

  test("keeps the latest point if every point is outside the horizon", () => {
    const filtered = filterSeriesByHorizon(data, 0);

    expect(filtered.series).toEqual([data.series[data.series.length - 1]]);
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
