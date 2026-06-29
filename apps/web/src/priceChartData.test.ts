import { describe, expect, test } from "bun:test";
import {
  buildComparisonRows,
  buildPriceVolumeRows,
  createCompareTickerList,
  formatVolumeAxis,
  formatVolumeTooltip,
  MAX_COMPARE_TICKERS,
  seriesHasVolume,
  summarizeComparisonResults,
  type TickerFetchResult,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

describe("createCompareTickerList", () => {
  test("adds valid ticker", () => {
    const result = createCompareTickerList(["AAPL"], "msft");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tickers).toEqual(["AAPL", "MSFT"]);
  });

  test("rejects duplicate", () => {
    const result = createCompareTickerList(["AAPL", "MSFT"], "aapl");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already");
  });

  test("rejects invalid format", () => {
    const result = createCompareTickerList(["AAPL"], "!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Invalid");
  });

  test("rejects empty input", () => {
    const result = createCompareTickerList(["AAPL"], "  ");
    expect(result.ok).toBe(false);
  });

  test("rejects when at cap", () => {
    const current = Array.from({ length: MAX_COMPARE_TICKERS }, (_, i) => `T${i}`);
    const result = createCompareTickerList(current, "NEW");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(String(MAX_COMPARE_TICKERS));
  });
});

describe("buildComparisonRows", () => {
  test("outer-joins timestamps with null for missing points", () => {
    const rows = buildComparisonRows({
      AAPL: [
        { timestamp: 1000, close: 10 },
        { timestamp: 2000, close: 11 },
      ],
      MSFT: [{ timestamp: 2000, close: 50 }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ t: 1_000_000, AAPL: 10, MSFT: null });
    expect(rows[1]).toEqual({ t: 2_000_000, AAPL: 11, MSFT: 50 });
  });

  test("returns empty for no series", () => {
    expect(buildComparisonRows({})).toEqual([]);
  });
});

describe("summarizeComparisonResults", () => {
  test("splits successes and failures", () => {
    const results: TickerFetchResult[] = [
      {
        ticker: "AAPL",
        ok: true,
        data: { ticker: "AAPL", currency: "USD", lastPrice: 1, series: [] },
      },
      { ticker: "BAD", ok: false, error: "Not found" },
    ];
    const summary = summarizeComparisonResults(results);
    expect(summary.successful).toHaveLength(1);
    expect(summary.successful[0]!.ticker).toBe("AAPL");
    expect(summary.failures).toEqual([{ ticker: "BAD", error: "Not found" }]);
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
