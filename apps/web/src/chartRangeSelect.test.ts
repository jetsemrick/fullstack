import { describe, expect, test } from "bun:test";
import {
  formatSignedMoney,
  formatSignedPercent,
  netChangeForWindow,
  rangeChangeStatusClass,
  rowsInTimeRange,
} from "./chartRangeSelect";
import type { ChartRow } from "./priceChartData";

const rows: ChartRow[] = [
  { t: 100, price: 100 },
  { t: 200, price: 110 },
  { t: 300, price: 90 },
  { t: 400, price: 95 },
];

describe("rowsInTimeRange", () => {
  test("includes endpoints regardless of drag direction", () => {
    expect(rowsInTimeRange(rows, 200, 300)).toEqual([
      { t: 200, price: 110 },
      { t: 300, price: 90 },
    ]);
    expect(rowsInTimeRange(rows, 300, 200)).toEqual([
      { t: 200, price: 110 },
      { t: 300, price: 90 },
    ]);
  });
});

describe("netChangeForWindow", () => {
  test("uses first and last close in the window", () => {
    const change = netChangeForWindow(rows, 100, 400);
    expect(change).not.toBeNull();
    expect(change!.abs).toBeCloseTo(-5);
    expect(change!.pct).toBeCloseTo(-5);
    expect(change!.pointCount).toBe(4);
  });

  test("matches manual percent: (last - first) / first", () => {
    const change = netChangeForWindow(rows, 100, 200);
    expect(change!.abs).toBeCloseTo(10);
    expect(change!.pct).toBeCloseTo(10);
  });

  test("returns null for a single point", () => {
    expect(netChangeForWindow(rows, 200, 200)).toBeNull();
  });

  test("returns null when first close is zero", () => {
    const zero: ChartRow[] = [
      { t: 1, price: 0 },
      { t: 2, price: 5 },
    ];
    expect(netChangeForWindow(zero, 1, 2)).toBeNull();
  });
});

describe("formatting and status", () => {
  test("signed money and percent match header badge signs", () => {
    expect(formatSignedMoney(-1.5)).toBe("-1.50");
    expect(formatSignedPercent(2.5)).toBe("+2.50%");
    expect(formatSignedPercent(0)).toBe("0.00%");
  });

  test("status classes match header badge semantics", () => {
    expect(rangeChangeStatusClass(0.01)).toBe("positive");
    expect(rangeChangeStatusClass(-0.01)).toBe("negative");
    expect(rangeChangeStatusClass(0)).toBe("muted");
  });
});
