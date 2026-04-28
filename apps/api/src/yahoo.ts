import type { PricePoint } from "@stock/shared";
import { DEFAULT_INTERVAL, DEFAULT_RANGE } from "@stock/shared";

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export type YahooParseResult = {
  errorMessage: string | null;
  points: PricePoint[];
  currency: string | null;
  lastPrice: number | null;
  symbol: string | null;
};

export function parseResult(body: unknown): YahooParseResult {
  if (typeof body !== "object" || body === null) {
    return { errorMessage: "Invalid JSON", points: [], currency: null, lastPrice: null, symbol: null };
  }
  const chart = (body as Record<string, unknown>).chart;
  if (typeof chart !== "object" || chart === null) {
    return { errorMessage: "Missing chart", points: [], currency: null, lastPrice: null, symbol: null };
  }
  const err = (chart as Record<string, unknown>).error;
  if (typeof err === "object" && err !== null && "description" in err) {
    const d = (err as { description?: unknown }).description;
    return {
      errorMessage: typeof d === "string" ? d : "Chart error",
      points: [],
      currency: null,
      lastPrice: null,
      symbol: null,
    };
  }
  const result = (chart as Record<string, unknown>).result;
  if (!Array.isArray(result) || result[0] === undefined) {
    return { errorMessage: "No data for symbol", points: [], currency: null, lastPrice: null, symbol: null };
  }
  const first = result[0] as Record<string, unknown>;
  const meta = first.meta;
  const currency =
    typeof meta === "object" && meta !== null && typeof (meta as { currency?: unknown }).currency === "string"
      ? (meta as { currency: string }).currency
      : null;
  const lastPrice =
    typeof meta === "object" && meta !== null
      ? pickNumber(
          (meta as { regularMarketPrice?: unknown; previousClose?: unknown; chartPreviousClose?: unknown })
            .regularMarketPrice,
        ) ??
        pickNumber(
          (meta as { previousClose?: unknown; chartPreviousClose?: unknown; regularMarketPrice?: unknown })
            .chartPreviousClose,
        )
      : null;
  const symbol =
    typeof meta === "object" && meta !== null && typeof (meta as { symbol?: unknown }).symbol === "string"
      ? (meta as { symbol: string }).symbol
      : null;
  const timestamps = first.timestamp;
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    return { errorMessage: "No series data", points: [], currency, lastPrice, symbol };
  }
  const indicators = first.indicators;
  const quote = extractQuoteArrays(indicators);
  if (!quote || !Array.isArray(quote.close) || quote.close.length !== timestamps.length) {
    return { errorMessage: "Malformed quote data", points: [], currency, lastPrice, symbol };
  }
  const points: PricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = quote.close[i];
    if (typeof ts !== "number" || (close !== null && typeof close !== "number")) {
      continue;
    }
    if (close === null) continue;
    const vol = quote.volume;
    let volume: number | null = null;
    if (vol && Array.isArray(vol) && i < vol.length) {
      const v = vol[i];
      volume = typeof v === "number" ? v : v === null ? null : null;
    }
    points.push({ timestamp: ts, close, volume });
  }
  if (points.length === 0) {
    return { errorMessage: "No price points", points: [], currency, lastPrice, symbol };
  }
  return { errorMessage: null, points, currency, lastPrice, symbol };
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function extractQuoteArrays(indicators: unknown): { close: (number | null)[]; volume: (number | null)[] | null } | null {
  if (typeof indicators !== "object" || indicators === null) return null;
  const quoteArr = (indicators as { quote?: unknown[] }).quote;
  if (!Array.isArray(quoteArr) || !quoteArr[0]) return null;
  const q0 = quoteArr[0] as { close?: unknown; volume?: unknown };
  if (!Array.isArray(q0.close)) return null;
  const volume = Array.isArray(q0.volume) ? (q0.volume as (number | null)[]) : null;
  return { close: q0.close as (number | null)[], volume };
}

export type YahooChartOpts = {
  range?: string;
  interval?: string;
};

/** Fetches chart data; defaults match package constants (max / 1d). */
export async function fetchYahooChart(ticker: string, opts?: YahooChartOpts): Promise<YahooParseResult> {
  const url = new URL(`${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}`);
  url.searchParams.set("range", opts?.range ?? DEFAULT_RANGE);
  url.searchParams.set("interval", opts?.interval ?? DEFAULT_INTERVAL);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)" },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      errorMessage: `Invalid response (${res.status})`,
      points: [] as PricePoint[],
      currency: null,
      lastPrice: null,
      symbol: null,
    };
  }
  const parsed = parseResult(json);
  if (!res.ok) {
    return { ...parsed, errorMessage: parsed.errorMessage ?? `HTTP ${res.status}` };
  }
  return parsed;
}
