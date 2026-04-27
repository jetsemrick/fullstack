import type { ApiErrorBody, GetPricesResponse } from "@stock/shared";
import { DEFAULT_TICKER } from "@stock/shared";
import { getDemoPricesResponse } from "./demo";
import { fetchYahooChart } from "./yahoo";

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

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
    if (process.env.DEMO_MODE === "1") {
      const body: GetPricesResponse = getDemoPricesResponse(ticker);
      return jsonResponse(body, { status: 200, headers: corsHeaders() });
    }
    try {
      const yahoo = await fetchYahooChart(ticker);
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
  return new Response("Not found", { status: 404, headers: corsHeaders() });
}
