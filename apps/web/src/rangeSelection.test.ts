import { describe, expect, test } from "bun:test";
import {
  computeRangeStats,
  formatSignedPercent,
  formatSignedPrice,
  rowsInWindow,
} from "./rangeSelection";
import type { ChartRow } from "./priceChartData";

const rows: ChartRow[] = [
  { t: 10, price: 100 },
  { t: 20, price: 110 },
  { t: 30, price: 90 },
  { t: 40, price: 120 },
];

describe("rowsInWindow", () => {
  test("is order-agnostic on the bounds", () => {
    expect(rowsInWindow(rows, 20, 40)).toEqual(rows.slice(1));
    expect(rowsInWindow(rows, 40, 20)).toEqual(rows.slice(1));
  });
  test("is inclusive of both endpoints", () => {
    expect(rowsInWindow(rows, 10, 10)).toEqual([rows[0]]);
  });
});

describe("computeRangeStats", () => {
  test("returns null when a bound is missing", () => {
    expect(computeRangeStats(rows, null, 40)).toBeNull();
    expect(computeRangeStats(rows, 10, null)).toBeNull();
  });

  test("returns null for non-finite bounds", () => {
    expect(computeRangeStats(rows, NaN, 40)).toBeNull();
  });

  test("returns null when fewer than two points fall inside", () => {
    expect(computeRangeStats(rows, 10, 10)).toBeNull();
    expect(computeRangeStats(rows, 11, 19)).toBeNull();
  });

  test("uses first and last close within the window", () => {
    const stats = computeRangeStats(rows, 10, 40);
    expect(stats).not.toBeNull();
    expect(stats!.startPrice).toBe(100);
    expect(stats!.endPrice).toBe(120);
    expect(stats!.absChange).toBe(20);
    expect(stats!.pctChange).toBeCloseTo(20, 5);
    expect(stats!.direction).toBe("up");
    expect(stats!.pointCount).toBe(4);
  });

  test("works right-to-left and for negative moves", () => {
    const stats = computeRangeStats(rows, 30, 20);
    expect(stats!.startPrice).toBe(110);
    expect(stats!.endPrice).toBe(90);
    expect(stats!.absChange).toBe(-20);
    expect(stats!.direction).toBe("down");
  });

  test("flat when first and last close match", () => {
    const flat: ChartRow[] = [
      { t: 1, price: 50 },
      { t: 2, price: 75 },
      { t: 3, price: 50 },
    ];
    const stats = computeRangeStats(flat, 1, 3);
    expect(stats!.absChange).toBe(0);
    expect(stats!.direction).toBe("flat");
  });
});

describe("formatSignedPrice", () => {
  test("prefixes sign and appends currency", () => {
    expect(formatSignedPrice(12.5, "USD")).toBe("+12.50 USD");
    expect(formatSignedPrice(-3, "USD")).toBe("−3.00 USD");
    expect(formatSignedPrice(0)).toBe("0.00");
  });
});

describe("formatSignedPercent", () => {
  test("prefixes sign", () => {
    expect(formatSignedPercent(4.2)).toBe("+4.20%");
    expect(formatSignedPercent(-1)).toBe("−1.00%");
    expect(formatSignedPercent(0)).toBe("0.00%");
  });
});
