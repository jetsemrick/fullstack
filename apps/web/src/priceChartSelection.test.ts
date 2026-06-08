import { describe, expect, test } from "bun:test";
import { getPriceChartSelectionFromRange } from "./PriceChart";

const rows = [
  { t: 1_000, price: 100 },
  { t: 2_000, price: 105 },
  { t: 3_000, price: 103 },
  { t: 4_000, price: 112 },
];

describe("getPriceChartSelectionFromRange", () => {
  test("uses first and last close inside a left-to-right range", () => {
    expect(getPriceChartSelectionFromRange(rows, 1_500, 3_500)).toEqual({
      startMs: 2_000,
      endMs: 3_000,
      startPrice: 105,
      endPrice: 103,
      pointCount: 2,
    });
  });

  test("normalizes a right-to-left range", () => {
    expect(getPriceChartSelectionFromRange(rows, 4_000, 2_000)).toEqual({
      startMs: 2_000,
      endMs: 4_000,
      startPrice: 105,
      endPrice: 112,
      pointCount: 3,
    });
  });

  test("returns null for zero-width or single-point ranges", () => {
    expect(getPriceChartSelectionFromRange(rows, 2_000, 2_000)).toBeNull();
    expect(getPriceChartSelectionFromRange(rows, 900, 1_100)).toBeNull();
  });
});
