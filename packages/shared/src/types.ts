/** Single point on the price series (close-based line). */
export interface PricePoint {
  /** Unix seconds */
  timestamp: number;
  /** Adjusted or regular close, depending on source */
  close: number;
  /** Optional per-bar volume */
  volume: number | null;
}

export interface GetPricesResponse {
  ticker: string;
  currency: string | null;
  /** Most recent last price from metadata when available */
  lastPrice: number | null;
  series: PricePoint[];
}

export interface ApiErrorBody {
  error: string;
  code: "VALIDATION" | "UPSTREAM" | "NOT_FOUND" | "INTERNAL";
  details?: string;
}

/** One major index quote returned from `/api/market-context`. */
export interface MarketIndexQuote {
  symbol: string;
  shortName: string;
  /** Regular session last price when available */
  price: number | null;
  /** Regular session percent change vs previous close when available */
  changePercent: number | null;
}

/** US session context from Yahoo (major indexes + aggregated market session). */
export interface MarketContextResponse {
  /** Raw Yahoo `marketState` from the benchmark quote (often `REGULAR`, `CLOSED`, etc.). */
  marketState: string | null;
  indexes: MarketIndexQuote[];
}

/** Single stock quote for the ticker tape. */
export interface TickerQuote {
  symbol: string;
  shortName: string;
  /** Last price (regular market). */
  price: number | null;
  /** Session percent change vs previous close. */
  changePercent: number | null;
}

/** Response from /api/ticker-tape endpoint. */
export interface TickerTapeResponse {
  quotes: TickerQuote[];
}
