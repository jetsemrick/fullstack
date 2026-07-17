import type { Page } from "@playwright/test";

const DAY_MS = 24 * 60 * 60 * 1000;

type PricePoint = { timestamp: number; close: number; volume: number | null };
type GetPricesResponse = {
  ticker: string;
  currency: string | null;
  lastPrice: number | null;
  series: PricePoint[];
};
type MarketContextResponse = {
  marketState: string | null;
  indexes: Array<{
    symbol: string;
    shortName: string;
    price: number | null;
    changePercent: number | null;
  }>;
};

/** Build a close series ending "now" with enough points for horizon slicing. */
export function buildPriceSeries(
  ticker: string,
  opts: { lastPrice: number; points: number; stepMs: number; startClose: number },
): GetPricesResponse {
  const now = Date.now();
  const series = Array.from({ length: opts.points }, (_, i) => {
    const t = i / Math.max(opts.points - 1, 1);
    const close = opts.startClose + (opts.lastPrice - opts.startClose) * t;
    return {
      timestamp: Math.floor((now - (opts.points - 1 - i) * opts.stepMs) / 1000),
      close: Math.round(close * 100) / 100,
      volume: 1_000_000 + i * 1000,
    };
  });
  return {
    ticker,
    currency: "USD",
    lastPrice: opts.lastPrice,
    series,
  };
}

export const marketContextFixture: MarketContextResponse = {
  marketState: "REGULAR",
  indexes: [
    {
      symbol: "^GSPC",
      shortName: "S&P 500",
      price: 5980.87,
      changePercent: 0.12,
    },
    {
      symbol: "^DJI",
      shortName: "Dow Jones Industrial Average",
      price: 42000,
      changePercent: -0.08,
    },
    {
      symbol: "^IXIC",
      shortName: "NASDAQ Composite",
      price: 19100,
      changePercent: 0.2,
    },
  ],
};

const intradayByTicker: Record<string, GetPricesResponse> = {
  AAPL: buildPriceSeries("AAPL", {
    lastPrice: 198.5,
    startClose: 196.0,
    points: 24,
    stepMs: 5 * 60 * 1000,
  }),
  MSFT: buildPriceSeries("MSFT", {
    lastPrice: 425.1,
    startClose: 420.0,
    points: 24,
    stepMs: 5 * 60 * 1000,
  }),
};

const dailyByTicker: Record<string, GetPricesResponse> = {
  AAPL: buildPriceSeries("AAPL", {
    lastPrice: 198.5,
    startClose: 150.0,
    points: 400,
    stepMs: DAY_MS,
  }),
  MSFT: buildPriceSeries("MSFT", {
    lastPrice: 425.1,
    startClose: 300.0,
    points: 400,
    stepMs: DAY_MS,
  }),
};

/** Intercept `/api/*` so the demo does not depend on the Bun API or Yahoo. */
export async function mockStockApi(page: Page): Promise<void> {
  await page.route("**/api/market-context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(marketContextFixture),
    });
  });

  await page.route("**/api/prices**", async (route) => {
    const url = new URL(route.request().url());
    const ticker = (url.searchParams.get("ticker") ?? "AAPL").toUpperCase();
    const range = url.searchParams.get("range") ?? "1d";
    const catalog = range === "1d" ? intradayByTicker : dailyByTicker;
    const body = catalog[ticker] ?? {
      ...buildPriceSeries(ticker, {
        lastPrice: 100,
        startClose: 90,
        points: range === "1d" ? 24 : 400,
        stepMs: range === "1d" ? 5 * 60 * 1000 : DAY_MS,
      }),
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
