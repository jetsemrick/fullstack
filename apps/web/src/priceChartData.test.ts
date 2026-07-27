import { describe, expect, test } from "bun:test";
import {
  alignAndIndexSeries,
  buildPriceVolumeRows,
  downsampleRows,
  filterSeriesByHorizon,
  normalizeCompareTickers,
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

describe("normalizeCompareTickers", () => {
  test("uppercases and trims", () => {
    expect(normalizeCompareTickers("AAPL", [" msft "])).toEqual(["MSFT"]);
  });

  test("dedupes against primary and peers", () => {
    expect(normalizeCompareTickers("AAPL", ["aapl", "MSFT", "msft"])).toEqual(["MSFT"]);
  });

  test("caps total including primary", () => {
    const result = normalizeCompareTickers("AAPL", ["MSFT", "GOOG", "AMZN", "META", "NVDA"], 5);
    expect(result).toEqual(["MSFT", "GOOG", "AMZN", "META"]);
  });

  test("drops empty and whitespace-only", () => {
    expect(normalizeCompareTickers("AAPL", ["", "  ", "MSFT"])).toEqual(["MSFT"]);
  });

  test("preserves first-seen order among unique compares", () => {
    expect(normalizeCompareTickers("AAPL", ["MSFT", "GOOG", "AMZN"])).toEqual(["MSFT", "GOOG", "AMZN"]);
  });
});

describe("alignAndIndexSeries", () => {
  test("returns empty rows for empty input", () => {
    expect(alignAndIndexSeries([])).toEqual({ rows: [], tickers: [] });
  });

  test("returns empty rows for empty series", () => {
    expect(alignAndIndexSeries([{ ticker: "AAPL", series: [] }])).toEqual({ rows: [], tickers: [] });
  });

  test("indexes two fully overlapping series from 100", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 11, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: 1, close: 50, volume: null },
          { timestamp: 2, close: 55, volume: null },
        ],
      },
    ]);

    expect(result.tickers).toEqual(["AAPL", "MSFT"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ t: 1000, AAPL: 100, MSFT: 100 });
    expect(result.rows[1]!.t).toBe(2000);
    expect(result.rows[1]!.AAPL).toBeCloseTo(110, 5);
    expect(result.rows[1]!.MSFT).toBeCloseTo(110, 5);
  });

  test("uses intersection only for partial overlap", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 11, volume: null },
          { timestamp: 3, close: 12, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: 2, close: 50, volume: null },
          { timestamp: 3, close: 55, volume: null },
        ],
      },
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ t: 2000, AAPL: 100, MSFT: 100 });
    expect(result.rows[1]!.t).toBe(3000);
    expect(result.rows[1]!.AAPL).toBeCloseTo((12 / 11) * 100, 5);
    expect(result.rows[1]!.MSFT).toBeCloseTo(110, 5);
  });

  test("returns empty rows when there is no overlap", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [{ timestamp: 1, close: 10, volume: null }],
      },
      {
        ticker: "MSFT",
        series: [{ timestamp: 2, close: 50, volume: null }],
      },
    ]);

    expect(result).toEqual({ rows: [], tickers: ["AAPL", "MSFT"] });
  });

  test("skips tickers with zero base close without poisoning others", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 0, volume: null },
          { timestamp: 2, close: 11, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: 1, close: 50, volume: null },
          { timestamp: 2, close: 55, volume: null },
        ],
      },
    ]);

    expect(result.tickers).toEqual(["MSFT"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ t: 1000, MSFT: 100 });
    expect(result.rows[1]!.t).toBe(2000);
    expect(result.rows[1]!.MSFT).toBeCloseTo(110, 5);
  });

  test("indexes a single ticker consistently", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 12, volume: null },
        ],
      },
    ]);

    expect(result.tickers).toEqual(["AAPL"]);
    expect(result.rows).toEqual([
      { t: 1000, AAPL: 100 },
      { t: 2000, AAPL: 120 },
    ]);
  });

  test("aligns three tickers on shared timestamps", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 20, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: 1, close: 100, volume: null },
          { timestamp: 2, close: 110, volume: null },
        ],
      },
      {
        ticker: "GOOG",
        series: [
          { timestamp: 1, close: 200, volume: null },
          { timestamp: 2, close: 220, volume: null },
        ],
      },
    ]);

    expect(result.tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ t: 1000, AAPL: 100, MSFT: 100, GOOG: 100 });
    expect(result.rows[1]!.t).toBe(2000);
    expect(result.rows[1]!.AAPL).toBe(200);
    expect(result.rows[1]!.MSFT).toBeCloseTo(110, 5);
    expect(result.rows[1]!.GOOG).toBeCloseTo(110, 5);
  });

  test("preserves ticker order from input", () => {
    const result = alignAndIndexSeries([
      {
        ticker: "MSFT",
        series: [
          { timestamp: 1, close: 50, volume: null },
          { timestamp: 2, close: 55, volume: null },
        ],
      },
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 11, volume: null },
        ],
      },
    ]);

    expect(result.tickers).toEqual(["MSFT", "AAPL"]);
  });
});

describe("filterSeriesByHorizon", () => {
  const base: GetPricesResponse = {
    ticker: "AAPL",
    currency: "USD",
    lastPrice: 12,
    series: [
      { timestamp: 1_000, close: 10, volume: null },
      { timestamp: 2_000, close: 11, volume: null },
      { timestamp: 3_000, close: 12, volume: null },
    ],
  };

  test("returns same series for Infinity days", () => {
    expect(filterSeriesByHorizon(base, Infinity)).toEqual(base);
  });

  test("keeps points within finite window from latest bar", () => {
    const wide: GetPricesResponse = {
      ...base,
      series: [
        { timestamp: 10_000_000, close: 10, volume: null },
        { timestamp: 13_600_000, close: 11, volume: null },
        { timestamp: 50_000_000, close: 12, volume: null },
        { timestamp: 100_000_000, close: 13, volume: null },
      ],
    };
    const filtered = filterSeriesByHorizon(wide, 1);
    expect(filtered.series.map((p) => p.timestamp)).toEqual([13_600_000, 50_000_000, 100_000_000]);
  });

  test("does not throw for empty series", () => {
    const empty = { ...base, series: [] as PricePoint[] };
    expect(filterSeriesByHorizon(empty, 30)).toEqual(empty);
  });
});
