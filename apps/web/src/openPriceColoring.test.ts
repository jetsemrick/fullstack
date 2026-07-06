import { describe, expect, test } from "bun:test";
import { getOpenPrice, computeOpenPriceColoring, getOverallTrend } from "./openPriceColoring";
import type { GetPricesResponse } from "@stock/shared";

describe("getOpenPrice", () => {
  test("returns openPrice from response when available", () => {
    const data: GetPricesResponse = {
      ticker: "TEST",
      currency: "USD",
      lastPrice: 110,
      openPrice: 100,
      series: [
        { timestamp: 1000, close: 105, open: 100, volume: null },
        { timestamp: 2000, close: 110, open: 105, volume: null },
      ],
    };
    expect(getOpenPrice(data)).toBe(100);
  });

  test("falls back to first point open when openPrice is null", () => {
    const data: GetPricesResponse = {
      ticker: "TEST",
      currency: "USD",
      lastPrice: 110,
      openPrice: null,
      series: [
        { timestamp: 1000, close: 105, open: 100, volume: null },
        { timestamp: 2000, close: 110, open: 105, volume: null },
      ],
    };
    expect(getOpenPrice(data)).toBe(100);
  });

  test("falls back to first point close when open is null", () => {
    const data: GetPricesResponse = {
      ticker: "TEST",
      currency: "USD",
      lastPrice: 110,
      openPrice: null,
      series: [
        { timestamp: 1000, close: 105, open: null, volume: null },
        { timestamp: 2000, close: 110, open: null, volume: null },
      ],
    };
    expect(getOpenPrice(data)).toBe(105);
  });

  test("returns null for empty series", () => {
    const data: GetPricesResponse = {
      ticker: "TEST",
      currency: "USD",
      lastPrice: null,
      openPrice: null,
      series: [],
    };
    expect(getOpenPrice(data)).toBe(null);
  });
});

describe("computeOpenPriceColoring", () => {
  test("all above open: priceAbove shows price, priceBelow clamps to open", () => {
    const rows = [
      { t: 1000, price: 110 },
      { t: 2000, price: 115 },
      { t: 3000, price: 120 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ t: 1000, price: 110, priceAbove: 110, priceBelow: 100 });
    expect(result[1]).toEqual({ t: 2000, price: 115, priceAbove: 115, priceBelow: 100 });
    expect(result[2]).toEqual({ t: 3000, price: 120, priceAbove: 120, priceBelow: 100 });
  });

  test("all below open: priceBelow shows price, priceAbove clamps to open", () => {
    const rows = [
      { t: 1000, price: 90 },
      { t: 2000, price: 85 },
      { t: 3000, price: 80 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ t: 1000, price: 90, priceAbove: 100, priceBelow: 90 });
    expect(result[1]).toEqual({ t: 2000, price: 85, priceAbove: 100, priceBelow: 85 });
    expect(result[2]).toEqual({ t: 3000, price: 80, priceAbove: 100, priceBelow: 80 });
  });

  test("crossing from above to below inserts interpolated point", () => {
    const rows = [
      { t: 1000, price: 110 },
      { t: 2000, price: 90 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(3);
    expect(result[0].priceAbove).toBe(110);
    expect(result[0].priceBelow).toBe(100);
    expect(result[1].price).toBe(100);
    expect(result[1].priceAbove).toBe(100);
    expect(result[1].priceBelow).toBe(100);
    expect(result[2].priceAbove).toBe(100);
    expect(result[2].priceBelow).toBe(90);
  });

  test("crossing from below to above inserts interpolated point", () => {
    const rows = [
      { t: 1000, price: 90 },
      { t: 2000, price: 110 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(3);
    expect(result[0].priceBelow).toBe(90);
    expect(result[0].priceAbove).toBe(100);
    expect(result[1].price).toBe(100);
    expect(result[2].priceAbove).toBe(110);
    expect(result[2].priceBelow).toBe(100);
  });

  test("multiple crossings create multiple interpolated points", () => {
    const rows = [
      { t: 1000, price: 110 },
      { t: 2000, price: 90 },
      { t: 3000, price: 120 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(5);
    const crossings = result.filter((r) => r.price === 100);
    expect(crossings).toHaveLength(2);
  });

  test("point exactly at open is treated as above", () => {
    const rows = [
      { t: 1000, price: 100 },
      { t: 2000, price: 100 },
    ];
    const result = computeOpenPriceColoring(rows, 100);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.priceAbove === 100 && r.priceBelow === 100)).toBe(true);
  });

  test("empty rows returns empty", () => {
    const result = computeOpenPriceColoring([], 100);
    expect(result).toHaveLength(0);
  });
});

describe("getOverallTrend", () => {
  test("positive when last price above open", () => {
    const rows = [{ price: 100 }, { price: 110 }];
    expect(getOverallTrend(rows, 100)).toBe("positive");
  });

  test("negative when last price below open", () => {
    const rows = [{ price: 100 }, { price: 90 }];
    expect(getOverallTrend(rows, 100)).toBe("negative");
  });

  test("neutral when last price equals open", () => {
    const rows = [{ price: 100 }, { price: 100 }];
    expect(getOverallTrend(rows, 100)).toBe("neutral");
  });

  test("neutral for empty rows", () => {
    expect(getOverallTrend([], 100)).toBe("neutral");
  });
});
