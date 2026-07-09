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

/** How overlaid compare series are scaled on the Y axis. */
export type CompareNormalization = "indexed" | "absolute";

/** One ticker input for aligning multiple price series on a shared time index. */
export interface CompareSeriesInput {
  ticker: string;
  series: PricePoint[];
}

/** Chart row after aligning multiple tickers on common timestamps (`t` in ms). */
export type AlignedCompareRow = {
  t: number;
} & Record<string, number | undefined>;
