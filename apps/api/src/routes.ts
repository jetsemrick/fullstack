import type { ApiErrorBody, GetPricesResponse, MarketContextResponse } from "@stock/shared";
import { DEFAULT_TICKER } from "@stock/shared";
import { fetchYahooChart } from "./yahoo";
import { fetchMajorIndexQuotes } from "./yahoo-quote";

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

/** Yahoo chart query allowlists — reject unexpected values instead of forwarding. */
const ALLOWED_RANGE = new Set([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
]);
const ALLOWED_INTERVAL = new Set([
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "90m",
  "1h",
  "1d",
  "5d",
  "1wk",
  "1mo",
  "3mo",
]);

function jsonResponse(body: unknown, init: { status: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": CORS_ORIGIN,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function errBody(message: string, code: ApiErrorBody["code"], details?: string): ApiErrorBody {
  return { error: message, code, details };
}

const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

function normalizeTicker(raw: string | null): string {
  if (!raw || !raw.trim()) return DEFAULT_TICKER;
  return raw.trim().toUpperCase();
}

/**
 * Main HTTP entry for the API. Used by the Bun server in `index.ts` and by tests.
 */
export async function handleApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (url.pathname === "/api/health" && req.method === "GET") {
    return jsonResponse({ ok: true }, { status: 200, headers: corsHeaders() });
  }
  if (url.pathname === "/api/prices" && req.method === "GET") {
    const tickerRaw = url.searchParams.get("ticker");
    const ticker = normalizeTicker(tickerRaw);
    if (!TICKER_RE.test(ticker)) {
      return jsonResponse(errBody("Invalid ticker format", "VALIDATION"), { status: 400, headers: corsHeaders() });
    }
    try {
      const rangeRaw = url.searchParams.get("range");
      const intervalRaw = url.searchParams.get("interval");
      const range = rangeRaw === null ? undefined : rangeRaw;
      const interval = intervalRaw === null ? undefined : intervalRaw;
      if (range !== undefined && !ALLOWED_RANGE.has(range)) {
        return jsonResponse(errBody("Invalid range parameter", "VALIDATION"), { status: 400, headers: corsHeaders() });
      }
      if (interval !== undefined && !ALLOWED_INTERVAL.has(interval)) {
        return jsonResponse(errBody("Invalid interval parameter", "VALIDATION"), { status: 400, headers: corsHeaders() });
      }
      const yahoo = await fetchYahooChart(ticker, { range, interval });
      if (yahoo.errorMessage) {
        const isNoData = yahoo.points.length === 0;
        return jsonResponse(
          errBody(yahoo.errorMessage, isNoData ? "NOT_FOUND" : "UPSTREAM"),
          { status: isNoData ? 404 : 502, headers: corsHeaders() },
        );
      }
      const body: GetPricesResponse = {
        ticker: yahoo.symbol ?? ticker,
        currency: yahoo.currency,
        lastPrice: yahoo.lastPrice,
        series: yahoo.points,
      };
      return jsonResponse(body, { status: 200, headers: corsHeaders() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return jsonResponse(errBody("Failed to load prices", "INTERNAL", msg), { status: 500, headers: corsHeaders() });
    }
  }
  if (url.pathname === "/api/market-context" && req.method === "GET") {
    try {
      const y = await fetchMajorIndexQuotes();
      if (y.errorMessage || y.indexes.length === 0) {
        return jsonResponse(
          errBody(y.errorMessage ?? "No benchmark quotes", "UPSTREAM"),
          { status: 502, headers: corsHeaders() },
        );
      }
      const body: MarketContextResponse = { marketState: y.marketState, indexes: y.indexes };
      return jsonResponse(body, { status: 200, headers: corsHeaders() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return jsonResponse(errBody("Failed to load market context", "INTERNAL", msg), { status: 500, headers: corsHeaders() });
    }
  }
  return new Response("Not found", { status: 404, headers: corsHeaders() });
}
