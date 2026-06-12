import { describe, expect, test } from "bun:test";
import {
  computeRangeChange,
  formatSignedPercent,
  formatSignedPrice,
  type RangeRow,
} from "./rangeSelection";

const rows: RangeRow[] = [
  { t: 1000, price: 100 },
  { t: 2000, price: 110 },
  { t: 3000, price: 105 },
  { t: 4000, price: 120 },
  { t: 5000, price: 90 },
];

describe("computeRangeChange", () => {
  test("returns null for null endpoints", () => {
    expect(computeRangeChange(rows, null, 3000)).toBeNull();
    expect(computeRangeChange(rows, 1000, null)).toBeNull();
  });

  test("returns null for zero-width selection", () => {
    expect(computeRangeChange(rows, 2000, 2000)).toBeNull();
  });

  test("returns null when fewer than two points fall in window", () => {
    // Window between two adjacent data points but excluding both edges.
    expect(computeRangeChange(rows, 1200, 1800)).toBeNull();
  });

  test("uses first and last close within the window, not series endpoints", () => {
    const r = computeRangeChange(rows, 2000, 4000)!;
    expect(r.startMs).toBe(2000);
    expect(r.endMs).toBe(4000);
    expect(r.startClose).toBe(110);
    expect(r.endClose).toBe(120);
    expect(r.diff).toBeCloseTo(10);
    expect(r.pct).toBeCloseTo((10 / 110) * 100);
    expect(r.status).toBe("positive");
  });

  test("normalizes right-to-left drag to the same window", () => {
    const ltr = computeRangeChange(rows, 2000, 4000)!;
    const rtl = computeRangeChange(rows, 4000, 2000)!;
    expect(rtl).toEqual(ltr);
  });

  test("snaps to nearest in-window points across gaps", () => {
    const r = computeRangeChange(rows, 1500, 4500)!;
    expect(r.startMs).toBe(2000);
    expect(r.endMs).toBe(4000);
  });

  test("negative status when end below start", () => {
    const r = computeRangeChange(rows, 4000, 5000)!;
    expect(r.diff).toBeCloseTo(-30);
    expect(r.status).toBe("negative");
  });

  test("muted status when flat", () => {
    const flat: RangeRow[] = [
      { t: 1, price: 50 },
      { t: 2, price: 50 },
    ];
    const r = computeRangeChange(flat, 1, 2)!;
    expect(r.diff).toBe(0);
    expect(r.status).toBe("muted");
  });

  test("returns null when first close is zero (avoids divide-by-zero)", () => {
    const zero: RangeRow[] = [
      { t: 1, price: 0 },
      { t: 2, price: 10 },
    ];
    expect(computeRangeChange(zero, 1, 2)).toBeNull();
  });
});

describe("formatSignedPrice", () => {
  test("positive gets +$", () => {
    expect(formatSignedPrice(12.5)).toBe("+$12.50");
  });
  test("negative gets -$ with absolute value", () => {
    expect(formatSignedPrice(-3.4)).toBe("-$3.40");
  });
  test("zero has no sign", () => {
    expect(formatSignedPrice(0)).toBe("$0.00");
  });
});

describe("formatSignedPercent", () => {
  test("positive gets +", () => {
    expect(formatSignedPercent(2.25)).toBe("+2.25%");
  });
  test("negative keeps minus", () => {
    expect(formatSignedPercent(-1.1)).toBe("-1.10%");
  });
});
