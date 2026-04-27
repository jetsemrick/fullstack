import type { GetPricesResponse, PricePoint } from "@stock/shared";

const DEMO_DAY_SECONDS = 86400;
/** Fixed calendar anchor so snapshots and tests stay stable */
const DEMO_SERIES_START_UNIX = 1_700_000_000;
const DEMO_BAR_COUNT = 22;

/**
 * Deterministic daily OHLC-style series (close + volume) for demos and UI tests
 * without calling Yahoo Finance. Not for production pricing.
 */
export function getDemoPricesResponse(ticker: string): GetPricesResponse {
  const series: PricePoint[] = [];
  let close = 178.2;
  for (let i = 0; i < DEMO_BAR_COUNT; i++) {
    const t = DEMO_SERIES_START_UNIX + i * DEMO_DAY_SECONDS;
    close = Math.round((close + Math.sin(i * 0.4) * 1.4 + i * 0.08) * 100) / 100;
    const volume = 850_000 + (i % 5) * 140_000 + Math.round(35_000 * Math.sin(i * 0.7));
    series.push({ timestamp: t, close, volume });
  }
  const last = series[series.length - 1]!;
  return {
    ticker: ticker.toUpperCase(),
    currency: "USD",
    lastPrice: last.close,
    series,
  };
}
