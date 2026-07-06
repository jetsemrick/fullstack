import { describe, expect, test } from "bun:test";
import {
  addTickerToList,
  buildMultiSeriesChartPayload,
  buildPriceVolumeRows,
  downsampleMultiChartRows,
  downsampleRows,
  mergeSeriesByUnionTimestamps,
  normalizeTickerInput,
  removeTickerFromList,
  responseToChartRows,
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

describe("normalizeTickerInput", () => {
  test("trims and uppercases", () => {
    expect(normalizeTickerInput("  msft  ")).toBe("MSFT");
  });
});

describe("addTickerToList", () => {
  test("rejects duplicate", () => {
    expect(addTickerToList(["AAPL"], "aapl")).toEqual({ tickers: ["AAPL"], rejected: "duplicate" });
  });

  test("rejects at cap", () => {
    const full = ["A", "B", "C", "D", "E"];
    expect(addTickerToList(full, "F")).toEqual({ tickers: full, rejected: "cap" });
  });

  test("appends new ticker", () => {
    expect(addTickerToList(["AAPL"], "MSFT")).toEqual({ tickers: ["AAPL", "MSFT"] });
  });
});

describe("removeTickerFromList", () => {
  test("removes matching ticker", () => {
    expect(removeTickerFromList(["AAPL", "MSFT"], "AAPL")).toEqual(["MSFT"]);
  });
});

describe("mergeSeriesByUnionTimestamps", () => {
  test("uses union timestamps and null gaps", () => {
    const merged = mergeSeriesByUnionTimestamps([
      {
        ticker: "AAPL",
        rows: [
          { t: 1000, price: 10 },
          { t: 2000, price: 11 },
        ],
      },
      {
        ticker: "MSFT",
        rows: [
          { t: 1500, price: 20 },
          { t: 2000, price: 21 },
        ],
      },
    ]);

    expect(merged).toEqual([
      { t: 1000, AAPL: 10, MSFT: null },
      { t: 1500, AAPL: null, MSFT: 20 },
      { t: 2000, AAPL: 11, MSFT: 21 },
    ]);
  });
});

describe("buildMultiSeriesChartPayload", () => {
  test("returns merged rows and series metadata", () => {
    const payload = buildMultiSeriesChartPayload([
      {
        ticker: "AAPL",
        data: {
          ticker: "AAPL",
          currency: "USD",
          lastPrice: 11,
          series: [
            { timestamp: 1, close: 10, volume: null },
            { timestamp: 2, close: 11, volume: null },
          ],
        },
      },
      {
        ticker: "MSFT",
        data: {
          ticker: "MSFT",
          currency: "USD",
          lastPrice: 21,
          series: [{ timestamp: 2, close: 21, volume: null }],
        },
      },
    ]);

    expect(payload?.series.map((s) => s.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(payload?.rows).toEqual([
      { t: 1000, AAPL: 10, MSFT: null },
      { t: 2000, AAPL: 11, MSFT: 21 },
    ]);
  });
});

describe("downsampleMultiChartRows", () => {
  test("preserves shared timestamps across tickers", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      t: i * 1000,
      AAPL: 100 + i,
      MSFT: 200 + i,
    }));
    const sampled = downsampleMultiChartRows(rows, 4);
    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    for (const row of sampled) {
      expect(row.AAPL).not.toBeNull();
      expect(row.MSFT).not.toBeNull();
    }
  });
});

describe("responseToChartRows", () => {
  test("converts unix seconds to ms", () => {
    expect(
      responseToChartRows({
        ticker: "X",
        currency: null,
        lastPrice: null,
        series: [{ timestamp: 5, close: 99, volume: null }],
      }),
    ).toEqual([{ t: 5000, price: 99 }]);
  });
});
