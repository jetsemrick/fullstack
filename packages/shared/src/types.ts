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

/** Input for computing a buy-at-date backtest. */
export interface BacktestInput {
  /** Price series (daily bars with timestamp and close). */
  series: PricePoint[];
  /** Trade date as YYYY-MM-DD string (local calendar date). */
  tradeDate: string;
  /** Number of shares to buy (positive). */
  volume: number;
}

/** Result of a buy-at-date backtest computation. */
export interface BacktestResult {
  /** Entry date used (YYYY-MM-DD), may differ from tradeDate if rolled to next trading day. */
  entryDate: string;
  /** Entry price (close on entryDate). */
  entryPrice: number;
  /** Latest close price from the series. */
  latestPrice: number;
  /** Cost basis = entryPrice * volume. */
  costBasis: number;
  /** Market value = latestPrice * volume. */
  marketValue: number;
  /** Dollar P&L = marketValue - costBasis. */
  pnlDollars: number;
  /** Percent P&L = (latestPrice - entryPrice) / entryPrice * 100. */
  pnlPercent: number;
}

/** Error returned when backtest cannot be computed. */
export interface BacktestError {
  code: "INVALID_DATE" | "FUTURE_DATE" | "NO_DATA_AFTER_DATE" | "INVALID_VOLUME" | "EMPTY_SERIES";
  message: string;
}
