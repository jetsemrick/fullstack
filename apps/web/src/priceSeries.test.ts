import { describe, expect, test } from "bun:test";
import type { GetPricesResponse } from "@stock/shared";
import { filterSeriesByHorizon } from "./priceSeries";

const DAY_SECONDS = 24 * 60 * 60;
const latestTimestamp = 1_704_067_200;

function priceDataWithOffsets(dayOffsets: number[]): GetPricesResponse {
  return {
    ticker: "AAPL",
    currency: "USD",
    lastPrice: 100,
    series: dayOffsets.map((daysAgo, i) => ({
      timestamp: latestTimestamp - daysAgo * DAY_SECONDS,
      close: i + 1,
      volume: null,
    })),
  };
}

describe("filterSeriesByHorizon", () => {
  test("keeps only the last year when timestamps are Unix seconds", () => {
    const data = priceDataWithOffsets([366, 365, 100, 0]);

    const filtered = filterSeriesByHorizon(data, 365);

    expect(filtered.series.map((p) => p.timestamp)).toEqual([
      latestTimestamp - 365 * DAY_SECONDS,
      latestTimestamp - 100 * DAY_SECONDS,
      latestTimestamp,
    ]);
  });

  test("keeps only the last five years when timestamps are Unix seconds", () => {
    const data = priceDataWithOffsets([2000, 1825, 365, 0]);

    const filtered = filterSeriesByHorizon(data, 1825);

    expect(filtered.series.map((p) => p.timestamp)).toEqual([
      latestTimestamp - 1825 * DAY_SECONDS,
      latestTimestamp - 365 * DAY_SECONDS,
      latestTimestamp,
    ]);
  });

  test("does not filter all-time data", () => {
    const data = priceDataWithOffsets([2000, 365, 0]);

    expect(filterSeriesByHorizon(data, Infinity)).toBe(data);
  });
});
