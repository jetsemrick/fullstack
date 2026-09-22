import { describe, expect, test } from "bun:test";
import { calendarDate, computeBuyAtDateBacktest } from "./backtest";
import type { PricePoint } from "./types";

/** Unix seconds. 14:30 UTC is 09:30 Eastern in January (EST). */
function utc(year: number, month: number, day: number, hour = 14, minute = 30): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 1000);
}

const NOW = new Date(Date.UTC(2024, 0, 15, 16, 0, 0));

function bar(timestamp: number, close: number): PricePoint {
  return { timestamp, close, volume: null };
}

const FRIDAY = utc(2024, 1, 5);
const MONDAY = utc(2024, 1, 8);
const WEDNESDAY = utc(2024, 1, 10);

describe("calendarDate", () => {
  test("uses the US Eastern session date when UTC has already rolled", () => {
    const lateFriday = utc(2024, 1, 6, 3, 0);
    expect(calendarDate(lateFriday)).toBe("2024-01-05");
    expect(calendarDate(FRIDAY)).toBe("2024-01-05");
  });
});

describe("computeBuyAtDateBacktest", () => {
  const series = [bar(WEDNESDAY, 121), bar(FRIDAY, 100), bar(MONDAY, 110)];

  test("buys the same session and marks to the latest close", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "aapl",
      volume: "10",
      tradeDate: "2024-01-05",
      series,
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.ticker).toBe("AAPL");
    expect(out.result.entryDate).toBe("2024-01-05");
    expect(out.result.entryClose).toBe(100);
    expect(out.result.latestDate).toBe("2024-01-10");
    expect(out.result.latestClose).toBe(121);
    expect(out.result.costBasis).toBe(1000);
    expect(out.result.marketValue).toBe(1210);
    expect(out.result.pnlDollars).toBe(210);
    expect(out.result.pnlPercent).toBeCloseTo(21);
  });

  test("rolls a weekend date forward to the next daily bar", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "10",
      tradeDate: "2024-01-06",
      series,
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.requestedDate).toBe("2024-01-06");
    expect(out.result.entryDate).toBe("2024-01-08");
    expect(out.result.entryClose).toBe(110);
    expect(out.result.pnlDollars).toBe(110);
    expect(out.result.pnlPercent).toBeCloseTo(10);
  });

  test("treats a post-midnight UTC bar as the prior Eastern session", () => {
    const lateFriday = utc(2024, 1, 6, 3, 0);
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "2",
      tradeDate: "2024-01-06",
      series: [bar(lateFriday, 100), bar(MONDAY, 110)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.entryDate).toBe("2024-01-08");
    expect(out.result.entryClose).toBe(110);
  });

  test("uses an IPO bar when the requested date is before the first close", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "NEW",
      volume: "1",
      tradeDate: "2024-01-01",
      series: [bar(MONDAY, 50), bar(WEDNESDAY, 55)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.entryDate).toBe("2024-01-08");
    expect(out.result.entryClose).toBe(50);
    expect(out.result.pnlDollars).toBe(5);
  });

  test("zero P&L when the entry bar is the latest close", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "4",
      tradeDate: "2024-01-10",
      series: [bar(FRIDAY, 100), bar(WEDNESDAY, 121)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pnlDollars).toBe(0);
    expect(out.result.pnlPercent).toBe(0);
    expect(out.result.costBasis).toBe(484);
    expect(out.result.marketValue).toBe(484);
  });

  test("errors when no bar exists on or after the trade date", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "10",
      tradeDate: "2024-01-12",
      series,
      now: NOW,
    });
    expect(out).toEqual({
      ok: false,
      code: "NO_BARS",
      error: "No daily close on or after that date.",
    });
  });

  test("errors on an empty series", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "10",
      tradeDate: "2024-01-05",
      series: [],
      now: NOW,
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("NO_BARS");
  });

  test("skips non-positive closes", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "1",
      tradeDate: "2024-01-05",
      series: [bar(FRIDAY, 0), bar(MONDAY, 10)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.entryDate).toBe("2024-01-08");
    expect(out.result.entryClose).toBe(10);
  });

  test("rejects empty, invalid, and non-positive volume", () => {
    const base = { ticker: "AAPL", tradeDate: "2024-01-05", series, now: NOW };
    expect(computeBuyAtDateBacktest({ ...base, volume: "  " }).ok).toBe(false);
    expect(computeBuyAtDateBacktest({ ...base, volume: "abc" })).toMatchObject({
      ok: false,
      code: "INVALID_VOLUME",
    });
    expect(computeBuyAtDateBacktest({ ...base, volume: "0" })).toMatchObject({
      ok: false,
      code: "INVALID_VOLUME",
      error: "Share volume must be greater than zero.",
    });
    expect(computeBuyAtDateBacktest({ ...base, volume: "-3" })).toMatchObject({
      ok: false,
      code: "INVALID_VOLUME",
    });
  });

  test("rejects blank and malformed tickers", () => {
    const base = { volume: "1", tradeDate: "2024-01-05", series, now: NOW };
    expect(computeBuyAtDateBacktest({ ...base, ticker: "  " })).toMatchObject({
      ok: false,
      code: "INVALID_TICKER",
      error: "Enter a ticker.",
    });
    expect(computeBuyAtDateBacktest({ ...base, ticker: "AA PL" })).toMatchObject({
      ok: false,
      code: "INVALID_TICKER",
    });
  });

  test("rejects empty, impossible, and future dates", () => {
    const base = { ticker: "AAPL", volume: "1", series, now: NOW };
    expect(computeBuyAtDateBacktest({ ...base, tradeDate: "" })).toMatchObject({
      ok: false,
      code: "INVALID_DATE",
      error: "Choose a trade date.",
    });
    expect(computeBuyAtDateBacktest({ ...base, tradeDate: "2024-02-31" })).toMatchObject({
      ok: false,
      code: "INVALID_DATE",
    });
    expect(computeBuyAtDateBacktest({ ...base, tradeDate: "2024-01-16" })).toMatchObject({
      ok: false,
      code: "FUTURE_DATE",
      error: "Trade date cannot be in the future.",
    });
  });

  test("reports a loss when the latest close is below the entry", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "AAPL",
      volume: "2",
      tradeDate: "2024-01-05",
      series: [bar(FRIDAY, 100), bar(MONDAY, 90)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.pnlDollars).toBe(-20);
    expect(out.result.pnlPercent).toBeCloseTo(-10);
    expect(out.result.marketValue).toBe(180);
  });

  test("allows fractional share volume", () => {
    const out = computeBuyAtDateBacktest({
      ticker: "MSFT",
      volume: "0.5",
      tradeDate: "2024-01-08",
      series: [bar(MONDAY, 200), bar(WEDNESDAY, 220)],
      now: NOW,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.costBasis).toBe(100);
    expect(out.result.marketValue).toBe(110);
    expect(out.result.pnlDollars).toBe(10);
  });
});
