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

describe("filterSeriesByHorizon", () => {
  const DAY = 86_400;
  const latest = 1_762_000_000;
  // Daily bars spanning ~10 years, oldest first, in Unix seconds.
  const series: PricePoint[] = Array.from({ length: 3650 }, (_, i) => ({
    timestamp: latest - (3649 - i) * DAY,
    close: i + 1,
    volume: null,
  }));
  const data: GetPricesResponse = { ticker: "X", currency: "USD", lastPrice: 3650, series };

  test("1 year keeps ~365 days ending at the latest bar", () => {
    const out = filterSeriesByHorizon(data, 365).series;
    expect(out.length).toBe(366);
    expect(out[0]!.timestamp).toBe(latest - 365 * DAY);
    expect(out[out.length - 1]!.timestamp).toBe(latest);
  });

  test("5 year keeps ~1825 days", () => {
    const out = filterSeriesByHorizon(data, 1825).series;
    expect(out.length).toBe(1826);
    expect(out[0]!.timestamp).toBe(latest - 1825 * DAY);
  });

  test("1 year and 5 year differ from all time", () => {
    const oneYear = filterSeriesByHorizon(data, 365).series;
    const fiveYear = filterSeriesByHorizon(data, 1825).series;
    const all = filterSeriesByHorizon(data, Infinity).series;
    expect(oneYear.length).toBeLessThan(fiveYear.length);
    expect(fiveYear.length).toBeLessThan(all.length);
  });

  test("all time returns the full series", () => {
    expect(filterSeriesByHorizon(data, Infinity)).toBe(data);
  });

  test("keeps the whole series when it is shorter than the horizon", () => {
    const short = { ...data, series: series.slice(-30) };
    expect(filterSeriesByHorizon(short, 365).series).toEqual(short.series);
  });

  test("returns data unchanged for an empty series", () => {
    const empty = { ...data, series: [] };
    expect(filterSeriesByHorizon(empty, 365)).toBe(empty);
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
