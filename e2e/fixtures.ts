import type { GetPricesResponse, MarketContextResponse } from "@stock/shared";

export function mockPricesResponse(ticker: string): GetPricesResponse {
  const base = ticker === "MSFT" ? 420 : ticker === "GOOG" ? 175 : 198.5;
  return {
    ticker,
    currency: "USD",
    lastPrice: base,
    series: [
      { timestamp: 1_700_000_000, close: base - 0.4, volume: 1_000_000 },
      { timestamp: 1_700_086_400, close: base, volume: 1_100_000 },
    ],
  };
}

export const mockMarketContext: MarketContextResponse = {
  marketState: "REGULAR",
  indexes: [
    { symbol: "^GSPC", shortName: "S&P 500", price: 5000, changePercent: 0.5 },
    { symbol: "^DJI", shortName: "Dow", price: 39000, changePercent: 0.2 },
    { symbol: "^IXIC", shortName: "NASDAQ", price: 16000, changePercent: 0.8 },
  ],
};
