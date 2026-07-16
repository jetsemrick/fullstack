import { describe, expect, test } from "bun:test";
import {
  computeBacktest,
  dateStringToTimestamp,
  timestampToDateString,
  type BacktestInput,
} from "../src/backtest";
import type { PricePoint } from "../src/types";

const mockSeries: PricePoint[] = [
  { timestamp: 1700000000, close: 100, volume: 1000000 },
  { timestamp: 1700086400, close: 105, volume: 1100000 },
  { timestamp: 1700172800, close: 110, volume: 1200000 },
  { timestamp: 1700259200, close: 108, volume: 900000 },
  { timestamp: 1700345600, close: 115, volume: 1300000 },
];

describe("computeBacktest", () => {
  test("computes correct P&L for valid input", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700086400,
      volume: 10,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.entryTimestamp).toBe(1700086400);
    expect(result.result.entryPrice).toBe(105);
    expect(result.result.latestTimestamp).toBe(1700345600);
    expect(result.result.latestPrice).toBe(115);
    expect(result.result.costBasis).toBe(1050);
    expect(result.result.marketValue).toBe(1150);
    expect(result.result.dollarPnL).toBe(100);
    expect(result.result.percentPnL).toBeCloseTo(9.5238, 2);
  });

  test("rolls to next trading day when date falls on non-trading day", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700050000,
      volume: 5,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.entryTimestamp).toBe(1700086400);
    expect(result.result.entryPrice).toBe(105);
  });

  test("uses first bar when trade date is before series start", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1690000000,
      volume: 10,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.entryTimestamp).toBe(1700000000);
    expect(result.result.entryPrice).toBe(100);
  });

  test("returns error for zero volume", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700086400,
      volume: 0,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_VOLUME");
  });

  test("returns error for negative volume", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700086400,
      volume: -5,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVALID_VOLUME");
  });

  test("returns error for empty series", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700086400,
      volume: 10,
      series: [],
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("EMPTY_SERIES");
  });

  test("returns error for future date", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1800000000,
      volume: 10,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("FUTURE_DATE");
  });

  test("handles negative P&L correctly", () => {
    const decliningPrices: PricePoint[] = [
      { timestamp: 1700000000, close: 100, volume: 1000000 },
      { timestamp: 1700086400, close: 95, volume: 1100000 },
      { timestamp: 1700172800, close: 90, volume: 1200000 },
    ];
    const input: BacktestInput = {
      tradeDateTimestamp: 1700000000,
      volume: 10,
      series: decliningPrices,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.dollarPnL).toBe(-100);
    expect(result.result.percentPnL).toBeCloseTo(-10, 2);
  });

  test("handles fractional volume", () => {
    const input: BacktestInput = {
      tradeDateTimestamp: 1700000000,
      volume: 2.5,
      series: mockSeries,
    };
    const result = computeBacktest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.costBasis).toBe(250);
    expect(result.result.marketValue).toBe(287.5);
    expect(result.result.dollarPnL).toBe(37.5);
  });
});

describe("dateStringToTimestamp", () => {
  test("converts YYYY-MM-DD to Unix timestamp", () => {
    const ts = dateStringToTimestamp("2023-11-15");
    expect(ts).toBe(1700006400);
  });

  test("handles start of year", () => {
    const ts = dateStringToTimestamp("2024-01-01");
    expect(ts).toBe(1704067200);
  });
});

describe("timestampToDateString", () => {
  test("converts Unix timestamp to YYYY-MM-DD", () => {
    const dateStr = timestampToDateString(1700006400);
    expect(dateStr).toBe("2023-11-15");
  });

  test("handles start of year", () => {
    const dateStr = timestampToDateString(1704067200);
    expect(dateStr).toBe("2024-01-01");
  });
});
