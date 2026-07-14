import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  downsampleRows,
  filterSeriesByHorizon,
  seriesHasVolume,
  formatVolumeAxis,
  formatVolumeTooltip,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

const DAY_SECONDS = 24 * 60 * 60;
const toSeconds = (date: string) => Date.parse(`${date}T00:00:00.000Z`) / 1000;

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
  const buildDailyResponse = (startDate: string, endDate: string): GetPricesResponse => {
    const start = toSeconds(startDate);
    const end = toSeconds(endDate);
    const series: PricePoint[] = [];

    for (let timestamp = start; timestamp <= end; timestamp += DAY_SECONDS) {
      series.push({ timestamp, close: series.length, volume: null });
    }

    return {
      ticker: "X",
      currency: "USD",
      lastPrice: series.length - 1,
      series,
    };
  };

  test("slices Unix-second series into distinct calendar-month and all-time windows", () => {
    const data = buildDailyResponse("2020-07-14", "2026-07-14");

    const oneYear = filterSeriesByHorizon(data, { kind: "months", value: 12 });
    const fiveYear = filterSeriesByHorizon(data, { kind: "months", value: 60 });
    const allTime = filterSeriesByHorizon(data, { kind: "all" });

    expect(oneYear.series[0]?.timestamp).toBe(toSeconds("2025-07-14"));
    expect(fiveYear.series[0]?.timestamp).toBe(toSeconds("2021-07-14"));
    expect(allTime.series[0]?.timestamp).toBe(toSeconds("2020-07-14"));
    expect(oneYear.series.length).toBeLessThan(fiveYear.series.length);
    expect(fiveYear.series.length).toBeLessThan(allTime.series.length);
    expect(allTime.series).toHaveLength(data.series.length);
  });

  test("clamps calendar-month cutoffs to the target month length", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 3,
      series: [
        { timestamp: toSeconds("2024-01-31"), close: 1, volume: null },
        { timestamp: toSeconds("2024-02-29"), close: 2, volume: null },
        { timestamp: toSeconds("2024-03-31"), close: 3, volume: null },
      ],
    };

    const filtered = filterSeriesByHorizon(data, { kind: "months", value: 1 });

    expect(filtered.series).toEqual(data.series.slice(1));
  });

  test("keeps the latest point when only it falls inside the requested window", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 2,
      series: [
        { timestamp: 1_600_000_000, close: 1, volume: null },
        { timestamp: 1_600_000_000 + 10 * DAY_SECONDS, close: 2, volume: null },
      ],
    };

    const filtered = filterSeriesByHorizon(data, { kind: "days", value: 1 });

    expect(filtered.series).toEqual([data.series[1]]);
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
