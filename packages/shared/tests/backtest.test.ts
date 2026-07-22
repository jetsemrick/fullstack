import { describe, expect, test } from "bun:test";
import { computeBacktest } from "../src/backtest";
import type { PricePoint, BacktestError } from "../src/types";

function makeBar(dateStr: string, close: number): PricePoint {
  const [y, m, d] = dateStr.split("-").map(Number);
  // PricePoint timestamps are Unix seconds (not milliseconds)
  const ts = Math.floor(Date.UTC(y, m - 1, d) / 1000);
  return { timestamp: ts, close, volume: null };
}

describe("computeBacktest", () => {
  test("computes correct P&L for a basic trade", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-02", 100),
      makeBar("2024-01-03", 105),
      makeBar("2024-01-04", 110),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.entryDate).toBe("2024-01-02");
    expect(result.result.entryPrice).toBe(100);
    expect(result.result.latestPrice).toBe(110);
    expect(result.result.costBasis).toBe(1000);
    expect(result.result.marketValue).toBe(1100);
    expect(result.result.pnlDollars).toBe(100);
    expect(result.result.pnlPercent).toBe(10);
  });

  test("rolls to next trading day for weekend date", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-05", 100), // Friday
      makeBar("2024-01-08", 110), // Monday
      makeBar("2024-01-09", 115),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-01-06", volume: 5 }); // Saturday

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.entryDate).toBe("2024-01-08"); // Rolled to Monday
    expect(result.result.entryPrice).toBe(110);
    expect(result.result.latestPrice).toBe(115);
    expect(result.result.costBasis).toBe(550);
    expect(result.result.marketValue).toBe(575);
    expect(result.result.pnlDollars).toBe(25);
  });

  test("handles negative P&L (loss)", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-02", 100),
      makeBar("2024-01-03", 95),
      makeBar("2024-01-04", 90),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.pnlDollars).toBe(-100);
    expect(result.result.pnlPercent).toBe(-10);
  });

  test("handles fractional shares", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-02", 100),
      makeBar("2024-01-03", 120),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 2.5 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.costBasis).toBe(250);
    expect(result.result.marketValue).toBe(300);
    expect(result.result.pnlDollars).toBe(50);
    expect(result.result.pnlPercent).toBe(20);
  });

  test("returns error for invalid date format", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const result = computeBacktest({ series, tradeDate: "01-02-2024", volume: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_DATE");
  });

  test("returns error for invalid date (Feb 30)", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const result = computeBacktest({ series, tradeDate: "2024-02-30", volume: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_DATE");
  });

  test("returns error for future date", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const futureDate = new Date();
    futureDate.setUTCDate(futureDate.getUTCDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];
    const result = computeBacktest({ series, tradeDate: futureDateStr, volume: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FUTURE_DATE");
  });

  test("returns error for zero volume", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_VOLUME");
  });

  test("returns error for negative volume", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: -5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_VOLUME");
  });

  test("returns error for empty series", () => {
    const result = computeBacktest({ series: [], tradeDate: "2024-01-02", volume: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("EMPTY_SERIES");
  });

  test("returns error when no data after trade date (IPO after date)", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-02", 100),
      makeBar("2024-01-03", 105),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-12-01", volume: 10 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_DATA_AFTER_DATE");
  });

  test("handles unsorted series", () => {
    const series: PricePoint[] = [
      makeBar("2024-01-04", 110),
      makeBar("2024-01-02", 100),
      makeBar("2024-01-03", 105),
    ];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.entryDate).toBe("2024-01-02");
    expect(result.result.entryPrice).toBe(100);
    expect(result.result.latestPrice).toBe(110);
  });

  test("handles single bar series where trade date matches", () => {
    const series: PricePoint[] = [makeBar("2024-01-02", 100)];
    const result = computeBacktest({ series, tradeDate: "2024-01-02", volume: 5 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.entryPrice).toBe(100);
    expect(result.result.latestPrice).toBe(100);
    expect(result.result.pnlDollars).toBe(0);
    expect(result.result.pnlPercent).toBe(0);
  });
});
