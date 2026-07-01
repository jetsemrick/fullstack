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
  test("returns null for missing or zero-width bounds", () => {
    expect(computeRangeChange(rows, null, 3000)).toBeNull();
    expect(computeRangeChange(rows, 1000, null)).toBeNull();
    expect(computeRangeChange(rows, 2000, 2000)).toBeNull();
  });

  test("returns null when fewer than two points fall in the window", () => {
    expect(computeRangeChange(rows, 1100, 1900)).toBeNull();
    expect(computeRangeChange(rows, 1500, 2500)).toBeNull();
  });

  test("uses the first and last close inside the selected window", () => {
    const result = computeRangeChange(rows, 2000, 4000);

    expect(result).toMatchObject({
      startMs: 2000,
      endMs: 4000,
      startPrice: 110,
      endPrice: 120,
      status: "positive",
    });
    expect(result?.diff).toBeCloseTo(10);
    expect(result?.pct).toBeCloseTo((10 / 110) * 100);
  });

  test("normalizes right-to-left drags", () => {
    expect(computeRangeChange(rows, 4000, 2000)).toEqual(computeRangeChange(rows, 2000, 4000));
  });

  test("reports negative and flat status", () => {
    expect(computeRangeChange(rows, 2000, 3000)?.status).toBe("negative");
    expect(computeRangeChange(rows, 4000, 5000)?.status).toBe("muted");
  });
});

describe("signed range formatting", () => {
  test("formats dollars", () => {
    expect(formatSignedPrice(1.234)).toBe("+$1.23");
    expect(formatSignedPrice(-0.48)).toBe("-$0.48");
    expect(formatSignedPrice(0)).toBe("$0.00");
  });

  test("formats percents", () => {
    expect(formatSignedPercent(16.29)).toBe("+16.29%");
    expect(formatSignedPercent(-0.156)).toBe("-0.16%");
    expect(formatSignedPercent(0)).toBe("0.00%");
  });
});
