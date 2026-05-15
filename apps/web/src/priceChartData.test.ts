import { describe, expect, test } from "bun:test";
import {
  buildComparisonChartRows,
  buildComparisonSeriesMeta,
  buildPriceVolumeRows,
  capUniqueTickers,
  filterSeriesByHorizon,
  formatVolumeAxis,
  formatVolumeTooltip,
  seriesHasVolume,
  COMPARISON_TICKER_LIMIT,
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

describe("capUniqueTickers", () => {
  test("dedupes preserving order", () => {
    expect(capUniqueTickers(["AAPL", "msft", "AAPL"])).toEqual(["AAPL", "MSFT"]);
  });
  test("respects limit", () => {
    expect(capUniqueTickers(["A", "B", "C", "D", "E", "F"], 3)).toEqual(["A", "B", "C"]);
  });
  test("default limit matches constant", () => {
    expect(COMPARISON_TICKER_LIMIT).toBe(5);
  });
});

describe("filterSeriesByHorizon", () => {
  test("keeps Infinity horizon unchanged", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: null,
      lastPrice: null,
      series: [{ timestamp: 100, close: 1, volume: null }],
    };
    expect(filterSeriesByHorizon(data, Infinity)).toEqual(data);
  });
  test("filters trailing window from latest timestamp", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: null,
      lastPrice: null,
      series: [
        { timestamp: 100_000, close: 1, volume: null },
        { timestamp: 180_000, close: 2, volume: null },
        { timestamp: 200_000, close: 3, volume: null },
      ],
    };
    const out = filterSeriesByHorizon(data, 1);
    expect(out.series.map((p) => p.timestamp)).toEqual([180_000, 200_000]);
  });
});

describe("buildComparisonChartRows", () => {
  test("percent mode uses baseline from earliest timestamp per ticker", () => {
    const a: GetPricesResponse = {
      ticker: "AAA",
      currency: null,
      lastPrice: null,
      series: [
        { timestamp: 10, close: 100, volume: null },
        { timestamp: 20, close: 110, volume: null },
      ],
    };
    const b: GetPricesResponse = {
      ticker: "BBB",
      currency: null,
      lastPrice: null,
      series: [
        { timestamp: 10, close: 50, volume: null },
        { timestamp: 20, close: 50, volume: null },
      ],
    };
    const m = new Map<string, GetPricesResponse>([
      ["AAA", a],
      ["BBB", b],
    ]);
    const rows = buildComparisonChartRows(["AAA", "BBB"], m, "percent");
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ t: 10_000, cmp0: 0, cmp1: 0 });
    expect(rows[1]?.cmp0).toBeCloseTo(10, 10);
    expect(rows[1]?.cmp1).toBe(0);
    expect(rows[1]?.t).toBe(20_000);
  });

  test("null when timestamp missing for a ticker", () => {
    const a: GetPricesResponse = {
      ticker: "A",
      currency: null,
      lastPrice: null,
      series: [{ timestamp: 1, close: 1, volume: null }],
    };
    const b: GetPricesResponse = {
      ticker: "B",
      currency: null,
      lastPrice: null,
      series: [{ timestamp: 2, close: 2, volume: null }],
    };
    const rows = buildComparisonChartRows(
      ["A", "B"],
      new Map([
        ["A", a],
        ["B", b],
      ]),
      "raw",
    );
    expect(rows).toEqual([
      { t: 1000, cmp0: 1, cmp1: null },
      { t: 2000, cmp0: null, cmp1: 2 },
    ]);
  });

  test("series meta keys align with ticker order", () => {
    const meta = buildComparisonSeriesMeta(["A", "B"]);
    expect(meta.map((m) => m.dataKey)).toEqual(["cmp0", "cmp1"]);
    expect(meta.map((m) => m.ticker)).toEqual(["A", "B"]);
  });
});
