import { describe, expect, test } from "bun:test";
import {
  computeRangeChange,
  formatSignedPercent,
  formatSignedPrice,
  type RangeRow,
} from "./rangeSelection";

const rows: RangeRow[] = [
  { t: 1_000, price: 100 },
  { t: 2_000, price: 110 },
  { t: 3_000, price: 105 },
  { t: 4_000, price: 120 },
  { t: 5_000, price: 90 },
];

describe("computeRangeChange", () => {
  test("null when an endpoint is missing", () => {
    expect(computeRangeChange(rows, null, 5_000)).toBeNull();
    expect(computeRangeChange(rows, 1_000, null)).toBeNull();
  });

  test("null for zero-width selection", () => {
    expect(computeRangeChange(rows, 3_000, 3_000)).toBeNull();
  });

  test("null when fewer than two points fall in the window", () => {
    // Window between two adjacent points contains only one data point.
    expect(computeRangeChange(rows, 2_100, 2_900)).toBeNull();
  });

  test("uses first and last close within the window, not global endpoints", () => {
    // Window [2000, 4000] -> first close 110, last close 120.
    const r = computeRangeChange(rows, 2_000, 4_000);
    expect(r).not.toBeNull();
    expect(r!.startClose).toBe(110);
    expect(r!.endClose).toBe(120);
    expect(r!.diff).toBeCloseTo(10);
    expect(r!.pct).toBeCloseTo((10 / 110) * 100);
    expect(r!.status).toBe("positive");
    expect(r!.startMs).toBe(2_000);
    expect(r!.endMs).toBe(4_000);
  });

  test("normalizes right-to-left selection (a > b)", () => {
    const ltr = computeRangeChange(rows, 2_000, 4_000);
    const rtl = computeRangeChange(rows, 4_000, 2_000);
    expect(rtl).toEqual(ltr);
  });

  test("negative change yields negative status", () => {
    // Window [4000, 5000] -> 120 -> 90.
    const r = computeRangeChange(rows, 4_000, 5_000);
    expect(r!.diff).toBeCloseTo(-30);
    expect(r!.status).toBe("negative");
  });

  test("flat change yields muted status", () => {
    const flat: RangeRow[] = [
      { t: 1_000, price: 50 },
      { t: 2_000, price: 75 },
      { t: 3_000, price: 50 },
    ];
    const r = computeRangeChange(flat, 1_000, 3_000);
    expect(r!.diff).toBe(0);
    expect(r!.status).toBe("muted");
  });

  test("includes partially-covered edge points by timestamp", () => {
    // Window edges between points still capture the points inside.
    const r = computeRangeChange(rows, 1_500, 4_500);
    expect(r!.startClose).toBe(110); // first point >= 1500 is t=2000
    expect(r!.endClose).toBe(120); // last point <= 4500 is t=4000
  });
});

describe("formatSignedPrice", () => {
  test("positive prefixes +$", () => {
    expect(formatSignedPrice(2.5)).toBe("+$2.50");
  });
  test("negative prefixes -$", () => {
    expect(formatSignedPrice(-0.42)).toBe("-$0.42");
  });
  test("zero has no sign", () => {
    expect(formatSignedPrice(0)).toBe("$0.00");
  });
});

describe("formatSignedPercent", () => {
  test("positive prefixes +", () => {
    expect(formatSignedPercent(0.95)).toBe("+0.95%");
  });
  test("negative keeps minus", () => {
    expect(formatSignedPercent(-0.15)).toBe("-0.15%");
  });
});
