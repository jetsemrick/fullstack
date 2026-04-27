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
