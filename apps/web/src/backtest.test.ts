import { describe, expect, test } from "bun:test";
import type { PricePoint } from "@stock/shared";
import { calculateBacktest } from "./backtest";

const seconds = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

const point = (date: string, close: number): PricePoint => ({
  timestamp: seconds(date),
  close,
  volume: null,
});

describe("calculateBacktest", () => {
  test("calculates returns from an exact trade date", () => {
    const result = calculateBacktest([point("2024-01-02", 10), point("2024-01-03", 15)], 4, "2024-01-02");

    expect(result).toEqual({
      ok: true,
      result: {
        entryTimestamp: seconds("2024-01-02"),
        entryClose: 10,
        latestTimestamp: seconds("2024-01-03"),
        latestClose: 15,
        volume: 4,
        costBasis: 40,
        marketValue: 60,
        profitLoss: 20,
        profitLossPercent: 50,
      },
    });
  });

  test("rolls a weekend trade date forward to the next available session", () => {
    const result = calculateBacktest(
      [point("2024-01-05", 10), point("2024-01-08", 12), point("2024-01-09", 18)],
      2,
      "2024-01-06",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.result.entryTimestamp).toBe(seconds("2024-01-08"));
    expect(result.result.entryClose).toBe(12);
    expect(result.result.costBasis).toBe(24);
    expect(result.result.marketValue).toBe(36);
  });

  test("selects a session by exchange-local date when its UTC timestamp is on the previous day", () => {
    const aucklandSession = Date.parse("2024-01-02T21:00:00Z") / 1000;
    const nextSession = Date.parse("2024-01-03T21:00:00Z") / 1000;
    const result = calculateBacktest(
      [
        { timestamp: aucklandSession, close: 10, volume: null },
        { timestamp: nextSession, close: 15, volume: null },
      ],
      2,
      "2024-01-03",
      "Pacific/Auckland",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.result.entryTimestamp).toBe(aucklandSession);
    expect(result.result.entryClose).toBe(10);
  });

  test("sorts unsorted price history before selecting entry and latest bars", () => {
    const result = calculateBacktest(
      [point("2024-01-12", 30), point("2024-01-10", 10), point("2024-01-11", 20)],
      2,
      "2024-01-11",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.result.entryTimestamp).toBe(seconds("2024-01-11"));
    expect(result.result.latestTimestamp).toBe(seconds("2024-01-12"));
    expect(result.result.costBasis).toBe(40);
    expect(result.result.marketValue).toBe(60);
  });

  test("rejects invalid calendar dates", () => {
    expect(calculateBacktest([point("2024-03-01", 10)], 1, "2024-02-30")).toEqual({
      ok: false,
      error: "Enter a valid trade date.",
    });
  });

  test("rejects non-positive volume", () => {
    const series = [point("2024-01-02", 10)];

    expect(calculateBacktest(series, 0, "2024-01-02")).toEqual({
      ok: false,
      error: "Share volume must be greater than zero.",
    });
    expect(calculateBacktest(series, -1, "2024-01-02")).toEqual({
      ok: false,
      error: "Share volume must be greater than zero.",
    });
  });

  test("rejects huge finite volume when calculated values overflow", () => {
    expect(calculateBacktest([point("2024-01-02", 2)], Number.MAX_VALUE, "2024-01-02")).toEqual({
      ok: false,
      error: "Share volume is too large.",
    });
  });

  test("rejects empty or invalid price history", () => {
    const invalidSeries: PricePoint[] = [
      { timestamp: Number.NaN, close: 10, volume: null },
      { timestamp: seconds("2024-01-02"), close: 0, volume: null },
      { timestamp: seconds("2024-01-03"), close: -1, volume: null },
      { timestamp: seconds("2024-01-04"), close: Number.NaN, volume: null },
    ];

    expect(calculateBacktest([], 1, "2024-01-02")).toEqual({
      ok: false,
      error: "No daily price history is available for this ticker.",
    });
    expect(calculateBacktest(invalidSeries, 1, "2024-01-02")).toEqual({
      ok: false,
      error: "No daily price history is available for this ticker.",
    });
  });

  test("rejects trade dates after the latest bar", () => {
    expect(calculateBacktest([point("2024-01-02", 10), point("2024-01-03", 15)], 1, "2024-01-04")).toEqual({
      ok: false,
      error: "No trading session is available on or after this date.",
    });
  });
});
