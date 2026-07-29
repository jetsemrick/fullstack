import { describe, expect, test } from "bun:test";
import {
  computeRangeStats,
  formatRangeWindow,
  formatSignedPercent,
  formatSignedPrice,
} from "./rangeSelection";
import type { ChartRow } from "./priceChartData";

const rows: ChartRow[] = [
  { t: 1_000, price: 100 },
  { t: 2_000, price: 110 },
  { t: 3_000, price: 105 },
  { t: 4_000, price: 125 },
];

describe("computeRangeStats", () => {
  test("uses first and last close inside the window", () => {
    const stats = computeRangeStats(rows, 2_000, 4_000);
    expect(stats).not.toBeNull();
    expect(stats!.startMs).toBe(2_000);
    expect(stats!.endMs).toBe(4_000);
    expect(stats!.startPrice).toBe(110);
    expect(stats!.endPrice).toBe(125);
    expect(stats!.change).toBe(15);
    expect(stats!.percentChange).toBeCloseTo(13.6364, 4);
    expect(stats!.pointCount).toBe(3);
    expect(stats!.direction).toBe("up");
  });

  test("is order independent so right-to-left drags match", () => {
    expect(computeRangeStats(rows, 4_000, 1_000)).toEqual(computeRangeStats(rows, 1_000, 4_000)!);
  });

  test("returns null for fewer than two closes", () => {
    expect(computeRangeStats(rows, 2_000, 2_000)).toBeNull();
    expect(computeRangeStats(rows, 2_100, 2_900)).toBeNull();
    expect(computeRangeStats([], 0, 10_000)).toBeNull();
  });

  test("marks a decline as negative", () => {
    const stats = computeRangeStats(rows, 2_000, 3_000);
    expect(stats!.change).toBe(-5);
    expect(stats!.direction).toBe("down");
    expect(stats!.percentChange).toBeCloseTo(-4.5455, 4);
  });

  test("treats sub-cent drift as flat", () => {
    const flat: ChartRow[] = [
      { t: 1, price: 50 },
      { t: 2, price: 50.001 },
    ];
    const stats = computeRangeStats(flat, 1, 2);
    expect(stats!.change).toBe(0);
    expect(stats!.direction).toBe("flat");
  });

  test("omits percent change when the first close is zero", () => {
    const zeroed: ChartRow[] = [
      { t: 1, price: 0 },
      { t: 2, price: 5 },
    ];
    expect(computeRangeStats(zeroed, 1, 2)!.percentChange).toBeNull();
  });

  test("ignores non-finite bounds", () => {
    expect(computeRangeStats(rows, Number.NaN, 4_000)).toBeNull();
  });
});

describe("formatSignedPrice", () => {
  test("signs and appends currency", () => {
    expect(formatSignedPrice(15, "USD")).toBe("+15.00 USD");
    expect(formatSignedPrice(-4.5, "USD")).toBe("-4.50 USD");
    expect(formatSignedPrice(0, null)).toBe("0.00");
  });
});

describe("formatSignedPercent", () => {
  test("signs and rounds to two decimals", () => {
    expect(formatSignedPercent(13.6364)).toBe("+13.64%");
    expect(formatSignedPercent(-4.5455)).toBe("-4.55%");
    expect(formatSignedPercent(0)).toBe("0.00%");
  });

  test("em dash when percent is unavailable", () => {
    expect(formatSignedPercent(null)).toBe("—");
  });
});

describe("formatRangeWindow", () => {
  test("daily window shows both endpoints", () => {
    const label = formatRangeWindow(Date.UTC(2024, 0, 2, 12), Date.UTC(2024, 0, 9, 12), "daily");
    expect(label).toContain("–");
    expect(label).toMatch(/2024/);
  });

  test("intraday window shows times", () => {
    const label = formatRangeWindow(Date.UTC(2024, 0, 2, 15), Date.UTC(2024, 0, 2, 18), "intraday");
    expect(label).toMatch(/\d/);
    expect(label).toContain("–");
  });
});
