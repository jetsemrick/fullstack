import type { PricePoint } from "@stock/shared";
import aaplSeedChart from "../fixtures/aapl-seed-chart.json";
import marketContextSeed from "../fixtures/market-context-seed.json";
import { parseResult, type YahooParseResult } from "./yahoo";
import { parseQuoteResponse, type YahooQuoteAggregate } from "./yahoo-quote";

/** Tickers with deterministic offline seed data. Unknown tickers return 404 in seed mode. */
export const SEED_TICKERS = ["AAPL"] as const;

export type SeedTicker = (typeof SEED_TICKERS)[number];

const SEED_CHART_BY_TICKER: Record<SeedTicker, YahooParseResult> = {
  AAPL: parseResult(aaplSeedChart),
};

const SEED_MARKET_CONTEXT: YahooQuoteAggregate = parseQuoteResponse(marketContextSeed);

/** True when `USE_SEED_DATA` is set to a truthy value (`1`, `true`, or `yes`). */
export function isSeedDataEnabled(): boolean {
  const value = process.env.USE_SEED_DATA?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Returns seeded chart data for known tickers; unknown tickers get a NOT_FOUND-shaped result. */
export function getSeedChartResult(ticker: string): YahooParseResult {
  const upper = ticker.toUpperCase();
  const seed = SEED_CHART_BY_TICKER[upper as SeedTicker];
  if (!seed || seed.errorMessage) {
    return {
      errorMessage: "No data for symbol",
      points: [] as PricePoint[],
      currency: null,
      lastPrice: null,
      symbol: null,
    };
  }
  return {
    errorMessage: null,
    points: seed.points,
    currency: seed.currency,
    lastPrice: seed.lastPrice,
    symbol: seed.symbol ?? upper,
  };
}

/** Returns seeded major-index quotes for the market strip. */
export function getSeedMarketContext(): YahooQuoteAggregate {
  if (SEED_MARKET_CONTEXT.errorMessage || SEED_MARKET_CONTEXT.indexes.length === 0) {
    return {
      errorMessage: "No benchmark quotes",
      marketState: null,
      indexes: [],
    };
  }
  return { ...SEED_MARKET_CONTEXT, errorMessage: null };
}
