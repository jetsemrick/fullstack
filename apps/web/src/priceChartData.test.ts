import { describe, expect, test } from "bun:test";
import {
  buildOverlayRows,
  buildPriceVolumeRows,
  dailyFetchRange,
  downsampleRows,
  filterSeriesByHorizon,
  seriesHasVolume,
  simpleMovingAverage,
  formatVolumeAxis,
  formatVolumeTooltip,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

const DAY = 86_400;

function pricesAt(offsetsDays: number[], latest = 1_800_000_000): GetPricesResponse {
  const series: PricePoint[] = offsetsDays
    .map((daysAgo, i) => ({
      timestamp: latest - daysAgo * DAY,
      close: i + 1,
      volume: null,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  return { ticker: "X", currency: "USD", lastPrice: series.at(-1)?.close ?? null, series };
}

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

describe("filterSeriesByHorizon", () => {
  test("1Y keeps only bars within 365 seconds-based days of the latest timestamp", () => {
    const data = pricesAt([3650, 400, 365, 100, 0]);
    const sliced = filterSeriesByHorizon(data, 365);
    expect(sliced.series.map((p) => p.timestamp)).toEqual([
      data.series[2]!.timestamp,
      data.series[3]!.timestamp,
      data.series[4]!.timestamp,
    ]);
  });

  test("5Y keeps a wider window than 1Y and still drops older history", () => {
    const data = pricesAt([4000, 2000, 1825, 200, 0]);
    const oneYear = filterSeriesByHorizon(data, 365);
    const fiveYear = filterSeriesByHorizon(data, 1825);
    expect(oneYear.series.map((p) => p.close)).toEqual([4, 5]);
    expect(fiveYear.series.map((p) => p.close)).toEqual([3, 4, 5]);
  });

  test("All Time (Infinity) returns the full series", () => {
    const data = pricesAt([4000, 2000, 100, 0]);
    const all = filterSeriesByHorizon(data, Infinity);
    expect(all.series).toEqual(data.series);
    expect(all).toBe(data);
  });

  test("does not treat timestamps as milliseconds (regression #144)", () => {
    const latest = 1_800_000_000;
    const data = pricesAt([4000, 0], latest);
    const sliced = filterSeriesByHorizon(data, 365);
    expect(sliced.series).toHaveLength(1);
    expect(sliced.series[0]!.timestamp).toBe(latest);
  });

  test("empty series is unchanged", () => {
    const data: GetPricesResponse = { ticker: "X", currency: "USD", lastPrice: null, series: [] };
    expect(filterSeriesByHorizon(data, 365)).toEqual(data);
  });
});

describe("dailyFetchRange", () => {
  test("1Y and 5Y request 10y daily so Yahoo does not coarsen the series", () => {
    expect(dailyFetchRange(365, "1y")).toBe("10y");
    expect(dailyFetchRange(1825, "5y")).toBe("10y");
  });

  test("Today and All Time keep their declared ranges", () => {
    expect(dailyFetchRange(1, "1d")).toBe("1d");
    expect(dailyFetchRange(Infinity, "max")).toBe("max");
  });
});

describe("simpleMovingAverage", () => {
  test("first window-1 points are null, then the mean of each window", () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  test("series shorter than the window is all null", () => {
    expect(simpleMovingAverage([10, 20, 30], 50)).toEqual([null, null, null]);
    expect(simpleMovingAverage([1, 2], 200)).toEqual([null, null]);
  });

  test("window of 1 equals the input series", () => {
    expect(simpleMovingAverage([4, 8, 15], 1)).toEqual([4, 8, 15]);
  });

  test("empty series stays empty", () => {
    expect(simpleMovingAverage([], 50)).toEqual([]);
  });

  test("invalid windows yield nulls", () => {
    expect(simpleMovingAverage([1, 2, 3], 0)).toEqual([null, null, null]);
    expect(simpleMovingAverage([1, 2, 3], -5)).toEqual([null, null, null]);
    expect(simpleMovingAverage([1, 2, 3], 2.5)).toEqual([null, null, null]);
  });

  test("a non-finite value nulls every window that includes it", () => {
    expect(simpleMovingAverage([1, Number.NaN, 3], 2)).toEqual([null, null, null]);
  });
});

describe("buildOverlayRows", () => {
  test("reuses volume mapping and leaves SMA 50/200 null until the window fills", () => {
    const series: PricePoint[] = Array.from({ length: 50 }, (_, i) => ({
      timestamp: 1_800_000_000 + i * DAY,
      close: 2,
      volume: i === 0 ? 1_000 : null,
    }));
    const rows = buildOverlayRows({
      ticker: "X",
      currency: "USD",
      lastPrice: 2,
      series,
    });
    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({ volume: 1_000, volumeBar: 1_000, sma50: null, sma200: null });
    expect(rows[48]?.sma50).toBeNull();
    expect(rows[49]?.sma50).toBe(2);
    expect(rows.every((row) => row.sma200 === null)).toBe(true);
  });
});
