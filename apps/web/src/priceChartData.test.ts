import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  buildSinglePriceRows,
  firstValidBaseClose,
  formatVolumeAxis,
  formatVolumeTooltip,
  mergeTimeAlignedIndexedPercent,
  seriesHasVolume,
  type FetchSeriesResult,
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

describe("buildSinglePriceRows", () => {
  test("uses ticker as the chart series key", () => {
    const data: GetPricesResponse = {
      ticker: "MSFT",
      currency: "USD",
      lastPrice: 20,
      series: [{ timestamp: 10, close: 20, volume: null }],
    };

    expect(buildSinglePriceRows(data)).toEqual([{ t: 10_000, MSFT: 20 }]);
  });
});

describe("firstValidBaseClose", () => {
  test("returns first positive finite close in time order", () => {
    expect(
      firstValidBaseClose([
        { timestamp: 2, close: 10, volume: null },
        { timestamp: 1, close: 5, volume: null },
      ]),
    ).toBe(5);
  });

  test("skips non-positive and non-finite closes", () => {
    expect(
      firstValidBaseClose([
        { timestamp: 1, close: 0, volume: null },
        { timestamp: 2, close: NaN, volume: null },
        { timestamp: 3, close: 100, volume: null },
      ]),
    ).toBe(100);
  });
});

describe("mergeTimeAlignedIndexedPercent", () => {
  test("indexes each series to 100 at its own start and aligns by timestamp", () => {
    const results: FetchSeriesResult[] = [
      {
        ok: true,
        ticker: "AAPL",
        series: [
          { timestamp: 100, close: 100, volume: null },
          { timestamp: 200, close: 110, volume: null },
        ],
      },
      {
        ok: true,
        ticker: "MSFT",
        series: [
          { timestamp: 100, close: 50, volume: null },
          { timestamp: 200, close: 55, volume: null },
        ],
      },
    ];

    const { rows, tickersOnChart, failed } = mergeTimeAlignedIndexedPercent(results);

    expect(failed).toEqual([]);
    expect(tickersOnChart).toEqual(["AAPL", "MSFT"]);
    expect(rows[0]).toMatchObject({ t: 100_000, AAPL: 100, MSFT: 100 });
    expect(rows[1].AAPL).toBeCloseTo(110, 5);
    expect(rows[1].MSFT).toBeCloseTo(110, 5);
  });

  test("records failed fetches and still merges successful symbols", () => {
    const results: FetchSeriesResult[] = [
      { ok: false, ticker: "BAD", error: "not found" },
      { ok: true, ticker: "GOOD", series: [{ timestamp: 1, close: 10, volume: null }] },
    ];

    const { rows, tickersOnChart, failed } = mergeTimeAlignedIndexedPercent(results);

    expect(failed).toEqual([{ ticker: "BAD", error: "not found" }]);
    expect(tickersOnChart).toEqual(["GOOD"]);
    expect(rows).toEqual([{ t: 1000, GOOD: 100 }]);
  });

  test("leaves null gaps when a symbol has no bar for a timestamp", () => {
    const results: FetchSeriesResult[] = [
      {
        ok: true,
        ticker: "A",
        series: [
          { timestamp: 1, close: 10, volume: null },
          { timestamp: 2, close: 20, volume: null },
        ],
      },
      { ok: true, ticker: "B", series: [{ timestamp: 2, close: 40, volume: null }] },
    ];

    const { rows } = mergeTimeAlignedIndexedPercent(results);

    expect(rows.find((row) => row.t === 1000)).toMatchObject({ A: 100, B: null });
    expect(rows.find((row) => row.t === 2000)).toMatchObject({ A: 200, B: 100 });
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
