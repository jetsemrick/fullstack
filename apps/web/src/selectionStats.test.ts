import { describe, expect, test } from "bun:test";
import { computeSelectionStats } from "./selectionStats";
import type { PricePoint } from "@stock/shared";

const series: Pick<PricePoint, "timestamp" | "close">[] = [
  { timestamp: 1_000, close: 100 },
  { timestamp: 2_000, close: 110 },
  { timestamp: 3_000, close: 90 },
  { timestamp: 4_000, close: 130 },
];

describe("computeSelectionStats", () => {
  test("null when no range", () => {
    expect(computeSelectionStats(series, null)).toBeNull();
  });

  test("null when fewer than two points fall inside the window", () => {
    // Window spans a single point (timestamp 2_000 → ms 2_000_000).
    expect(computeSelectionStats(series, { start: 1_500_000, end: 2_500_000 })).toBeNull();
  });

  test("uses first and last close within the window", () => {
    const stats = computeSelectionStats(series, { start: 1_000_000, end: 3_000_000 });
    expect(stats).not.toBeNull();
    expect(stats!.startClose).toBe(100);
    expect(stats!.endClose).toBe(90);
    expect(stats!.absChange).toBe(-10);
    expect(stats!.pctChange).toBeCloseTo(-10);
    expect(stats!.pointCount).toBe(3);
    expect(stats!.direction).toBe("down");
    expect(stats!.startMs).toBe(1_000_000);
    expect(stats!.endMs).toBe(3_000_000);
  });

  test("range is order-independent (right-to-left drag)", () => {
    const forward = computeSelectionStats(series, { start: 1_000_000, end: 4_000_000 });
    const backward = computeSelectionStats(series, { start: 4_000_000, end: 1_000_000 });
    expect(backward).toEqual(forward);
    expect(forward!.absChange).toBe(30);
    expect(forward!.direction).toBe("up");
  });

  test("flat direction when closes are equal", () => {
    const flat: Pick<PricePoint, "timestamp" | "close">[] = [
      { timestamp: 1, close: 50 },
      { timestamp: 2, close: 55 },
      { timestamp: 3, close: 50 },
    ];
    const stats = computeSelectionStats(flat, { start: 0, end: 5_000 });
    expect(stats!.absChange).toBe(0);
    expect(stats!.direction).toBe("flat");
  });

  test("pctChange null when the first close is zero", () => {
    const zeroStart: Pick<PricePoint, "timestamp" | "close">[] = [
      { timestamp: 1, close: 0 },
      { timestamp: 2, close: 10 },
    ];
    const stats = computeSelectionStats(zeroStart, { start: 0, end: 5_000 });
    expect(stats!.absChange).toBe(10);
    expect(stats!.pctChange).toBeNull();
  });
});
