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
  { t: 3000, price: 90 },
  { t: 4000, price: 120 },
  { t: 5000, price: 120 },
];

describe("computeRangeChange", () => {
  test("returns null for missing bounds", () => {
    expect(computeRangeChange(rows, null, 3000)).toBeNull();
    expect(computeRangeChange(rows, 1000, null)).toBeNull();
    expect(computeRangeChange(rows, undefined, undefined)).toBeNull();
  });

  test("returns null for zero-width selection", () => {
    expect(computeRangeChange(rows, 2000, 2000)).toBeNull();
  });

  test("returns null when fewer than two points fall in window", () => {
    // Window between two grid points contains no data points.
    expect(computeRangeChange(rows, 1100, 1900)).toBeNull();
    // Window touching exactly one point.
    expect(computeRangeChange(rows, 1500, 2500)).toBeNull();
  });

  test("uses first and last close within the window, not global endpoints", () => {
    const r = computeRangeChange(rows, 2000, 4000)!;
    expect(r.startPrice).toBe(110);
    expect(r.endPrice).toBe(120);
    expect(r.startMs).toBe(2000);
    expect(r.endMs).toBe(4000);
    expect(r.diff).toBeCloseTo(10);
    expect(r.pct).toBeCloseTo((10 / 110) * 100);
    expect(r.status).toBe("positive");
  });

  test("right-to-left drag normalizes to the same window", () => {
    const ltr = computeRangeChange(rows, 2000, 4000)!;
    const rtl = computeRangeChange(rows, 4000, 2000)!;
    expect(rtl).toEqual(ltr);
  });

  test("negative change reports negative status", () => {
    const r = computeRangeChange(rows, 2000, 3000)!;
    expect(r.diff).toBeCloseTo(-20);
    expect(r.status).toBe("negative");
  });

  test("flat change reports muted status", () => {
    const r = computeRangeChange(rows, 4000, 5000)!;
    expect(r.diff).toBe(0);
    expect(r.status).toBe("muted");
  });

  test("snaps to nearest in-window points across gaps", () => {
    // Bounds sit outside the data points but the window still spans them.
    const r = computeRangeChange(rows, 1900, 4100)!;
    expect(r.startMs).toBe(2000);
    expect(r.endMs).toBe(4000);
  });

  test("guards divide-by-zero when start price is 0", () => {
    const zeroStart: RangeRow[] = [
      { t: 1, price: 0 },
      { t: 2, price: 5 },
    ];
    const r = computeRangeChange(zeroStart, 1, 2)!;
    expect(r.diff).toBe(5);
    expect(r.pct).toBe(0);
  });
});

describe("formatSignedPrice", () => {
  test("positive", () => {
    expect(formatSignedPrice(1.234)).toBe("+$1.23");
  });
  test("negative", () => {
    expect(formatSignedPrice(-0.48)).toBe("-$0.48");
  });
  test("zero", () => {
    expect(formatSignedPrice(0)).toBe("$0.00");
  });
});

describe("formatSignedPercent", () => {
  test("positive", () => {
    expect(formatSignedPercent(16.29)).toBe("+16.29%");
  });
  test("negative", () => {
    expect(formatSignedPercent(-0.156)).toBe("-0.16%");
  });
  test("zero", () => {
    expect(formatSignedPercent(0)).toBe("0.00%");
  });
});
