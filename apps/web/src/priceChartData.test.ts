import { describe, expect, test } from "bun:test";
import {
  buildChartRows,
  buildPriceVolumeRows,
  downsampleRows,
  formatVolumeAxis,
  formatVolumeTooltip,
  modeSeries,
  percentChange,
  seriesHasAdjClose,
  seriesHasVolume,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

describe("seriesHasVolume", () => {
  test("false when empty", () => {
    expect(seriesHasVolume([])).toBe(false);
  });
  test("false when all null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, adjClose: null, volume: null },
      { timestamp: 2, close: 2, adjClose: null, volume: null },
    ];
    expect(seriesHasVolume(s)).toBe(false);
  });
  test("true when any non-null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, adjClose: null, volume: null },
      { timestamp: 2, close: 2, adjClose: null, volume: 1_000_000 },
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
        { timestamp: 1000, close: 1.5, adjClose: null, volume: 100 },
        { timestamp: 2000, close: 2, adjClose: null, volume: null },
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

describe("return modes", () => {
  // Dividend payer: adjusted closes sit below traded closes before each ex-date.
  const dividendStock: PricePoint[] = [
    { timestamp: 1, close: 50, adjClose: 40, volume: null },
    { timestamp: 2, close: 55, adjClose: 46, volume: null },
    { timestamp: 3, close: 60, adjClose: 60, volume: null },
  ];
  // No dividends: Yahoo's adjclose equals close up to float rounding.
  const nonDividendStock: PricePoint[] = [
    { timestamp: 1, close: 100.12, adjClose: 100.11999893, volume: null },
    { timestamp: 2, close: 140.5, adjClose: 140.50000763, volume: null },
  ];

  test("total return exceeds price return for a dividend stock", () => {
    const price = percentChange(dividendStock, "price")!;
    const total = percentChange(dividendStock, "total")!;
    expect(price).toBeCloseTo(20, 6);
    expect(total).toBeCloseTo(50, 6);
    expect(total).toBeGreaterThan(price);
  });

  test("non-dividend stock matches in both modes within rounding", () => {
    const price = percentChange(nonDividendStock, "price")!;
    const total = percentChange(nonDividendStock, "total")!;
    expect(price.toFixed(2)).toBe(total.toFixed(2));
  });

  test("total mode skips bars without adjClose instead of mixing in traded closes", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 10, adjClose: 9, volume: null },
      { timestamp: 2, close: 11, adjClose: null, volume: null },
      { timestamp: 3, close: 12, adjClose: 12, volume: null },
    ];
    expect(modeSeries(s, "total").map((p) => p.value)).toEqual([9, 12]);
    expect(modeSeries(s, "price").map((p) => p.value)).toEqual([10, 11, 12]);
  });

  test("buildChartRows converts seconds to ms and picks the mode's value", () => {
    const data: GetPricesResponse = { ticker: "KO", currency: "USD", lastPrice: 60, series: dividendStock };
    expect(buildChartRows(data, "total")[0]).toEqual({ t: 1000, price: 40 });
    expect(buildChartRows(data, "price")[0]).toEqual({ t: 1000, price: 50 });
  });

  test("percentChange is null with fewer than two plotted points", () => {
    const intraday: PricePoint[] = [
      { timestamp: 1, close: 10, adjClose: null, volume: null },
      { timestamp: 2, close: 11, adjClose: null, volume: null },
    ];
    expect(seriesHasAdjClose(intraday)).toBe(false);
    expect(percentChange(intraday, "total")).toBeNull();
    expect(seriesHasAdjClose(dividendStock)).toBe(true);
  });
});
