import { describe, expect, it } from "bun:test";
import { buildPriceChartRows, seriesHasVolume } from "./priceChartData";

describe("seriesHasVolume", () => {
  it("is false when all volumes are null", () => {
    expect(
      seriesHasVolume([
        { timestamp: 1, close: 10, volume: null },
        { timestamp: 2, close: 11, volume: null },
      ]),
    ).toBe(false);
  });

  it("is true when any volume is a number", () => {
    expect(
      seriesHasVolume([
        { timestamp: 1, close: 10, volume: null },
        { timestamp: 2, close: 11, volume: 1_000 },
      ]),
    ).toBe(true);
  });
});

describe("buildPriceChartRows", () => {
  it("converts timestamps to ms and preserves price and volume", () => {
    const rows = buildPriceChartRows({
      ticker: "X",
      currency: "USD",
      lastPrice: 1,
      series: [
        { timestamp: 1_700_000_000, close: 100.5, volume: 500 },
        { timestamp: 1_700_008_640, close: 101, volume: null },
      ],
    });
    expect(rows).toEqual([
      { t: 1_700_000_000_000, price: 100.5, volume: 500 },
      { t: 1_700_008_640_000, price: 101, volume: null },
    ]);
  });
});
