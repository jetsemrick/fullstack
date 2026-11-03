/** Single point on the price series (close-based line). */
export interface PricePoint {
  /** Unix seconds */
  timestamp: number;
  /** Adjusted or regular close, depending on source */
  close: number;
  /** Optional per-bar volume */
  volume: number | null;
}

/** Cash dividend paid per share. */
export interface DividendEvent {
  /** Unix seconds */
  timestamp: number;
  /** Per-share amount in the series currency */
  amount: number;
}

/** Stock split, e.g. 4-for-1 is numerator 4, denominator 1. */
export interface SplitEvent {
  /** Unix seconds */
  timestamp: number;
  numerator: number;
  denominator: number;
}

/** Corporate actions within the requested range; arrays are empty when there are none. */
export interface PriceEvents {
  dividends: DividendEvent[];
  splits: SplitEvent[];
}

export interface GetPricesResponse {
  ticker: string;
  currency: string | null;
  /** Most recent last price from metadata when available */
  lastPrice: number | null;
  series: PricePoint[];
  events: PriceEvents;
}

export interface ApiErrorBody {
  error: string;
  code: "VALIDATION" | "UPSTREAM" | "NOT_FOUND" | "INTERNAL" | "CONFIG";
  details?: string;
}

/** Body for `POST /api/report-bug` — user prompt to edit the local repo via Cursor SDK. */
export interface ReportBugRequest {
  /** Free-text bug report or edit request (1–4000 chars after trim). */
  message: string;
}

/** Success body for `POST /api/report-bug`. */
export interface ReportBugResponse {
  runId: string;
  status: "finished" | "error" | "cancelled";
  /** Final assistant summary when the run finished. */
  result?: string;
  /** Terminal failure message when status is error. */
  error?: string;
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
