import { describe, expect, test } from "bun:test";
import {
  buildComparisonRows,
  buildPriceVolumeRows,
  downsampleRows,
  downsampleWideRows,
  hasMixedCurrencies,
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

describe("buildComparisonRows", () => {
  test("unions timestamps and fills null gaps", () => {
    const { rows, meta } = buildComparisonRows([
      {
        ticker: "AAA",
        currency: "USD",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 11, volume: null },
        ],
      },
      {
        ticker: "BBB",
        currency: "USD",
        series: [
          { timestamp: 2, close: 20, volume: null },
          { timestamp: 3, close: 21, volume: null },
        ],
      },
    ]);

    expect(meta.map((entry) => entry.ticker)).toEqual(["AAA", "BBB"]);
    expect(rows).toEqual([
      { t: 1000, AAA: 10, BBB: null },
      { t: 2000, AAA: 11, BBB: 20 },
      { t: 3000, AAA: null, BBB: 21 },
    ]);
  });

  test("returns empty rows for empty input", () => {
    expect(buildComparisonRows([])).toEqual({ rows: [], meta: [] });
  });

  test("preserves ticker order in metadata", () => {
    const { meta } = buildComparisonRows([
      { ticker: "MSFT", currency: "USD", series: [{ timestamp: 1, close: 1, volume: null }] },
      { ticker: "AAPL", currency: "USD", series: [{ timestamp: 1, close: 2, volume: null }] },
    ]);
    expect(meta.map((entry) => entry.ticker)).toEqual(["MSFT", "AAPL"]);
    expect(meta[1]?.colorIndex).toBe(1);
  });
});

describe("hasMixedCurrencies", () => {
  test("false for single or matching currencies", () => {
    expect(
      hasMixedCurrencies([
        { ticker: "A", currency: "USD", colorIndex: 0 },
        { ticker: "B", currency: "USD", colorIndex: 1 },
      ]),
    ).toBe(false);
  });

  test("true when multiple currencies present", () => {
    expect(
      hasMixedCurrencies([
        { ticker: "A", currency: "USD", colorIndex: 0 },
        { ticker: "B", currency: "EUR", colorIndex: 1 },
      ]),
    ).toBe(true);
  });
});

describe("downsampleWideRows", () => {
  test("preserves endpoints and reduces row count", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      t: index,
      AAA: index,
      BBB: index * 2,
    }));

    const sampled = downsampleWideRows(rows, ["AAA", "BBB"], 6);

    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    expect(sampled.length).toBeLessThan(rows.length);
  });
});
