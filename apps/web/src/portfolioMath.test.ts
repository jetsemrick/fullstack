import { describe, expect, test } from "bun:test";
import { aggregatePortfolioTotals, rowMarketValue, rowUnrealizedPl, type HoldingValuationRow } from "./portfolioMath";

describe("aggregatePortfolioTotals", () => {
  test("sums market value and P&L across rows", () => {
    const rows: HoldingValuationRow[] = [
      { ticker: "A", shares: 10, averageCostPerShare: 100, lastPrice: 110 },
      { ticker: "B", shares: 2, averageCostPerShare: 50, lastPrice: 55 },
    ];
    const t = aggregatePortfolioTotals(rows);
    expect(t.totalMarketValue).toBeCloseTo(10 * 110 + 2 * 55, 10);
    expect(t.totalCostBasis).toBeCloseTo(10 * 100 + 2 * 50, 10);
    expect(t.totalUnrealizedPl).toBeCloseTo(10 * (110 - 100) + 2 * (55 - 50), 10);
  });

  test("ignores rows missing price for market value total", () => {
    const rows: HoldingValuationRow[] = [
      { ticker: "A", shares: 1, averageCostPerShare: 10, lastPrice: 12 },
      { ticker: "BAD", shares: 5, averageCostPerShare: 1, lastPrice: null },
    ];
    const t = aggregatePortfolioTotals(rows);
    expect(t.totalMarketValue).toBe(12);
    expect(t.totalUnrealizedPl).toBeCloseTo(2, 10);
  });

  test("totalUnrealizedPl null when no row has both price and cost", () => {
    const rows: HoldingValuationRow[] = [
      { ticker: "A", shares: 1, averageCostPerShare: null, lastPrice: 12 },
    ];
    const t = aggregatePortfolioTotals(rows);
    expect(t.totalMarketValue).toBe(12);
    expect(t.totalCostBasis).toBe(0);
    expect(t.totalUnrealizedPl).toBeNull();
  });
});

describe("row helpers", () => {
  test("rowMarketValue", () => {
    expect(rowMarketValue(3, 10)).toBe(30);
    expect(rowMarketValue(3, null)).toBeNull();
  });

  test("rowUnrealizedPl", () => {
    expect(rowUnrealizedPl(10, 110, 100)).toBeCloseTo(100, 10);
    expect(rowUnrealizedPl(10, 110, null)).toBeNull();
  });
});
