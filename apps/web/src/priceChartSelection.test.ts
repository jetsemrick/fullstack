import { describe, expect, test } from "bun:test";
import {
  changeStatus,
  computeRangeNetChange,
  formatDollarChange,
  formatPercentFromChange,
  normalizeSelectionRange,
  pointsInRange,
} from "./priceChartSelection";

const rows = [
  { t: 1_000, price: 100 },
  { t: 2_000, price: 110 },
  { t: 3_000, price: 105 },
  { t: 4_000, price: 120 },
];

describe("normalizeSelectionRange", () => {
  test("orders endpoints regardless of drag direction", () => {
    expect(normalizeSelectionRange(3_000, 1_000)).toEqual({ startMs: 1_000, endMs: 3_000 });
    expect(normalizeSelectionRange(1_000, 3_000)).toEqual({ startMs: 1_000, endMs: 3_000 });
  });
});

describe("pointsInRange", () => {
  test("includes boundary timestamps", () => {
    expect(pointsInRange(rows, { startMs: 2_000, endMs: 3_000 })).toEqual([
      { t: 2_000, price: 110 },
      { t: 3_000, price: 105 },
    ]);
  });
});

describe("computeRangeNetChange", () => {
  test("uses first and last close inside the window", () => {
    const change = computeRangeNetChange(rows, { startMs: 2_000, endMs: 4_000 });
    expect(change).toEqual({
      startPrice: 110,
      endPrice: 120,
      dollarChange: 10,
      percentChange: (10 / 110) * 100,
      pointCount: 3,
    });
  });

  test("returns null when fewer than two points", () => {
    expect(computeRangeNetChange(rows, { startMs: 2_000, endMs: 2_000 })).toBeNull();
    expect(computeRangeNetChange(rows, { startMs: 9_000, endMs: 9_500 })).toBeNull();
  });
});

describe("formatting helpers", () => {
  test("formatDollarChange adds plus for gains", () => {
    expect(formatDollarChange(1.5)).toBe("+1.50");
    expect(formatDollarChange(-2)).toBe("-2.00");
  });

  test("formatPercentFromChange adds plus for gains", () => {
    expect(formatPercentFromChange(1.25)).toBe("+1.25%");
    expect(formatPercentFromChange(-0.5)).toBe("-0.50%");
  });

  test("changeStatus maps sign", () => {
    expect(changeStatus(1)).toBe("positive");
    expect(changeStatus(-1)).toBe("negative");
    expect(changeStatus(0)).toBe("muted");
  });
});
