import { describe, expect, test } from "bun:test";
import type { GetPricesResponse, PricePoint } from "@stock/shared";
import { HORIZONS, filterSeriesByHorizon, formatPercentChange } from "./stockHorizonData";

const DAY_SECONDS = 24 * 60 * 60;
const LATEST_TIMESTAMP = 1_800_000_000;

function point(daysBeforeLatest: number, close: number): PricePoint {
  return {
    timestamp: LATEST_TIMESTAMP - daysBeforeLatest * DAY_SECONDS,
    close,
    volume: null,
  };
}

function prices(series: PricePoint[]): GetPricesResponse {
  return {
    ticker: "TEST",
    currency: "USD",
    lastPrice: series[series.length - 1]?.close ?? null,
    series,
  };
}

describe("filterSeriesByHorizon", () => {
  test("scopes 1 Year data using Unix-second timestamps", () => {
    const data = prices([point(366, 100), point(365, 200), point(30, 240), point(0, 260)]);
    const scoped = filterSeriesByHorizon(data, HORIZONS[1].days);

    expect(scoped.series.map((p) => p.timestamp)).toEqual([
      LATEST_TIMESTAMP - 365 * DAY_SECONDS,
      LATEST_TIMESTAMP - 30 * DAY_SECONDS,
      LATEST_TIMESTAMP,
    ]);
    expect(formatPercentChange(scoped)).toEqual({
      text: "+30.00%",
      isPositive: true,
      isNegative: false,
    });
  });

  test("scopes 5 Year data and calculates change from the first scoped point", () => {
    const data = prices([point(1826, 400), point(1825, 300), point(365, 240), point(0, 210)]);
    const scoped = filterSeriesByHorizon(data, HORIZONS[2].days);

    expect(scoped.series.map((p) => p.close)).toEqual([300, 240, 210]);
    expect(formatPercentChange(scoped)).toEqual({
      text: "-30.00%",
      isPositive: false,
      isNegative: true,
    });
  });

  test("keeps All Time data and calculates change from the full series", () => {
    const data = prices([point(6000, 80), point(1825, 120), point(365, 140), point(0, 160)]);
    const scoped = filterSeriesByHorizon(data, HORIZONS[3].days);

    expect(scoped).toBe(data);
    expect(scoped.series.map((p) => p.close)).toEqual([80, 120, 140, 160]);
    expect(formatPercentChange(scoped)).toEqual({
      text: "+100.00%",
      isPositive: true,
      isNegative: false,
    });
  });
});
