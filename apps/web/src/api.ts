import type { ApiErrorBody, GetPricesResponse, MarketContextResponse, ReportBugRequest, ReportBugResponse, TickerTapeResponse } from "@stock/shared";
import { SP_TICKER_TAPE_SYMBOLS } from "@stock/shared";

const TICKER_ORDER = new Map<string, number>(SP_TICKER_TAPE_SYMBOLS.map((symbol, index) => [symbol, index]));

export async function fetchPrices(params: {
  ticker: string;
  /** Yahoo chart range, e.g. `max`, `1d` */
  range?: string;
  /** Yahoo chart interval, e.g. `1d`, `5m` */
  interval?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: GetPricesResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const q = new URLSearchParams({ ticker: params.ticker });
  if (params.range) q.set("range", params.range);
  if (params.interval) q.set("interval", params.interval);
  const res = await fetch(`/api/prices?${q.toString()}`, { signal: params.signal });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, data: json as GetPricesResponse };
}

export async function fetchMarketContext(): Promise<
  { ok: true; data: MarketContextResponse } | { ok: false; error: ApiErrorBody; status: number }
> {
  const res = await fetch(`/api/market-context`);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, data: json as MarketContextResponse };
}

function parseTickerTapeResponse(json: unknown): TickerTapeResponse | null {
  if (typeof json !== "object" || json === null) return null;
  const rawQuotes = (json as Record<string, unknown>).quotes;
  if (!Array.isArray(rawQuotes) || rawQuotes.length < 10) return null;

  const quotes: TickerTapeResponse["quotes"] = [];
  const seenSymbols = new Set<string>();
  let previousIndex = -1;
  for (const raw of rawQuotes) {
    if (typeof raw !== "object" || raw === null) return null;
    const quote = raw as Record<string, unknown>;
    if (typeof quote.symbol !== "string" || !quote.symbol) return null;
    if (typeof quote.price !== "number" || !Number.isFinite(quote.price)) return null;
    if (typeof quote.changePercent !== "number" || !Number.isFinite(quote.changePercent)) return null;
    const symbolIndex = TICKER_ORDER.get(quote.symbol);
    if (symbolIndex === undefined || seenSymbols.has(quote.symbol) || symbolIndex <= previousIndex) return null;
    seenSymbols.add(quote.symbol);
    previousIndex = symbolIndex;
    quotes.push({ symbol: quote.symbol, price: quote.price, changePercent: quote.changePercent });
  }
  return { quotes };
}

export async function fetchTickerTape(
  signal?: AbortSignal,
): Promise<{ ok: true; data: TickerTapeResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const res = await fetch(`/api/ticker-tape`, { signal });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  const data = parseTickerTapeResponse(json);
  if (!data) {
    return {
      ok: false,
      status: 500,
      error: { error: "Invalid ticker tape response", code: "INTERNAL" },
    };
  }
  return { ok: true, data };
}

export async function reportBug(
  body: ReportBugRequest,
  signal?: AbortSignal,
): Promise<{ ok: true; data: ReportBugResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const res = await fetch(`/api/report-bug`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    // Agent run failures may return ReportBugResponse with status error (502).
    if (
      json &&
      typeof json === "object" &&
      "runId" in json &&
      "status" in json &&
      (json as ReportBugResponse).status === "error"
    ) {
      const data = json as ReportBugResponse;
      return {
        ok: false,
        status: res.status,
        error: { error: data.error ?? "Agent run failed", code: "UPSTREAM", details: data.runId },
      };
    }
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, data: json as ReportBugResponse };
}
