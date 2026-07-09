import { describe, expect, test } from "bun:test";
import { alignCompareSeries } from "./compareSeries";
import type { CompareSeriesInput } from "@stock/shared";

function dayKey(timestamp: number): number {
  return Math.floor(timestamp / 86_400) * 86_400;
}

describe("alignCompareSeries", () => {
  test("returns empty when no inputs", () => {
    expect(alignCompareSeries([], "indexed")).toEqual([]);
  });

  test("aligns on common daily timestamps", () => {
    const day1 = 1_700_000_000;
    const day2 = day1 + 86_400;
    const day3 = day2 + 86_400;
    const inputs: CompareSeriesInput[] = [
      {
        ticker: "AAPL",
        series: [
          { timestamp: day1, close: 100, volume: null },
          { timestamp: day2, close: 110, volume: null },
          { timestamp: day3, close: 120, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: day2, close: 200, volume: null },
          { timestamp: day3, close: 220, volume: null },
        ],
      },
    ];

    const rows = alignCompareSeries(inputs, "absolute", "daily");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ t: dayKey(day2) * 1000, AAPL: 110, MSFT: 200 });
    expect(rows[1]).toEqual({ t: dayKey(day3) * 1000, AAPL: 120, MSFT: 220 });
  });

  test("indexes each series to 100 at the first shared point", () => {
    const day1 = 1_700_000_000;
    const day2 = day1 + 86_400;
    const inputs: CompareSeriesInput[] = [
      {
        ticker: "AAPL",
        series: [
          { timestamp: day1, close: 100, volume: null },
          { timestamp: day2, close: 150, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: day1, close: 200, volume: null },
          { timestamp: day2, close: 300, volume: null },
        ],
      },
    ];

    const rows = alignCompareSeries(inputs, "indexed", "daily");
    expect(rows[0]).toEqual({ t: dayKey(day1) * 1000, AAPL: 100, MSFT: 100 });
    expect(rows[1]).toEqual({ t: dayKey(day2) * 1000, AAPL: 150, MSFT: 150 });
  });

  test("ignores dates that are not shared across all tickers", () => {
    const day1 = 1_700_000_000;
    const day2 = day1 + 86_400;
    const inputs: CompareSeriesInput[] = [
      {
        ticker: "AAPL",
        series: [{ timestamp: day1, close: 100, volume: null }],
      },
      {
        ticker: "MSFT",
        series: [{ timestamp: day2, close: 200, volume: null }],
      },
    ];

    expect(alignCompareSeries(inputs, "absolute", "daily")).toEqual([]);
  });

  test("uses exact timestamps for intraday alignment", () => {
    const inputs: CompareSeriesInput[] = [
      {
        ticker: "AAPL",
        series: [
          { timestamp: 1_700_000_000, close: 10, volume: null },
          { timestamp: 1_700_000_300, close: 11, volume: null },
        ],
      },
      {
        ticker: "MSFT",
        series: [
          { timestamp: 1_700_000_000, close: 20, volume: null },
          { timestamp: 1_700_000_300, close: 22, volume: null },
        ],
      },
    ];

    const rows = alignCompareSeries(inputs, "absolute", "intraday");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ t: 1_700_000_000_000, AAPL: 10, MSFT: 20 });
  });
});
