import { describe, expect, test } from "bun:test";
import {
  buildComparisonRows,
  buildPriceVolumeRows,
  createCompareTickerList,
  formatVolumeAxis,
  formatVolumeTooltip,
  normalizeComparisonSeries,
  seriesHasVolume,
  summarizeComparisonResults,
  type TickerFetchResult,
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

describe("buildComparisonRows", () => {
  test("aligns two series on shared timestamps with null gaps", () => {
    const rows = buildComparisonRows({
      AAPL: [
        { timestamp: 100, value: 0 },
        { timestamp: 200, value: 5 },
      ],
      MSFT: [
        { timestamp: 200, value: 2 },
        { timestamp: 300, value: 4 },
      ],
    });
    expect(rows).toEqual([
      { t: 100_000, AAPL: 0, MSFT: null },
      { t: 200_000, AAPL: 5, MSFT: 2 },
      { t: 300_000, AAPL: null, MSFT: 4 },
    ]);
  });

  test("handles mismatched date lengths without dropping the shorter series", () => {
    const rows = buildComparisonRows({
      AAPL: [
        { timestamp: 1, value: 0 },
        { timestamp: 2, value: 1 },
        { timestamp: 3, value: 2 },
      ],
      MSFT: [{ timestamp: 2, value: 0 }],
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ t: 1_000, AAPL: 0, MSFT: null });
    expect(rows[1]).toEqual({ t: 2_000, AAPL: 1, MSFT: 0 });
    expect(rows[2]).toEqual({ t: 3_000, AAPL: 2, MSFT: null });
  });
});

describe("normalizeComparisonSeries", () => {
  test("converts each symbol to percent change with first value at 0", () => {
    const out = normalizeComparisonSeries([
      { timestamp: 10, close: 100, volume: null },
      { timestamp: 20, close: 110, volume: null },
      { timestamp: 30, close: 90, volume: null },
    ]);
    expect(out).toEqual([
      { timestamp: 10, value: 0 },
      { timestamp: 20, value: 10 },
      { timestamp: 30, value: -10 },
    ]);
  });

  test("returns null values when first close is 0", () => {
    const out = normalizeComparisonSeries([
      { timestamp: 10, close: 0, volume: null },
      { timestamp: 20, close: 50, volume: null },
    ]);
    expect(out).toEqual([
      { timestamp: 10, value: null },
      { timestamp: 20, value: null },
    ]);
  });
});

describe("createCompareTickerList", () => {
  test("uppercases, trims, dedupes, and preserves order", () => {
    const result = createCompareTickerList(["AAPL"], "  msft ");
    expect(result).toEqual({ tickers: ["AAPL", "MSFT"] });
    expect(result.error).toBeUndefined();
  });

  test("rejects duplicate tickers", () => {
    const result = createCompareTickerList(["AAPL", "MSFT"], "aapl");
    expect(result.tickers).toEqual(["AAPL", "MSFT"]);
    expect(result.error).toBe("AAPL is already on the chart");
  });

  test("enforces max cap with user-facing reason", () => {
    const existing = ["A", "B", "C", "D", "E"];
    const result = createCompareTickerList(existing, "F", 5);
    expect(result.tickers).toEqual(existing);
    expect(result.error).toBe("Maximum 5 tickers allowed");
  });
});

describe("summarizeComparisonResults", () => {
  test("keeps successful data and exposes failed ticker errors", () => {
    const results: TickerFetchResult[] = [
      {
        ticker: "AAPL",
        ok: true,
        data: {
          ticker: "AAPL",
          currency: "USD",
          lastPrice: 100,
          series: [{ timestamp: 1, close: 100, volume: null }],
        },
      },
      { ticker: "BAD", ok: false, error: "Invalid symbol" },
    ];
    const summary = summarizeComparisonResults(results);
    expect(summary.successful).toHaveLength(1);
    expect(summary.successful[0]!.ticker).toBe("AAPL");
    expect(summary.failures).toEqual([{ ticker: "BAD", error: "Invalid symbol" }]);
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
