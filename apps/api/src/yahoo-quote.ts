import type { MarketIndexQuote } from "@stock/shared";
import { MAJOR_INDEX_SYMBOLS } from "@stock/shared";

const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export type YahooQuoteAggregate = {
  errorMessage: string | null;
  marketState: string | null;
  indexes: MarketIndexQuote[];
};

function pickNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Yahoo chart payloads usually omit `marketState` on meta (unlike v7 quote).
 * Rough US equities session using Eastern clock — ignores exchange holidays.
 */
function inferUsCashMarketStateUtc(nowUtcMs: number): string {
  let dow = "";
  let hour = 12;
  let minute = 0;
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(nowUtcMs))) {
    if (p.type === "weekday") dow = p.value;
    if (p.type === "hour") hour = Number(p.value);
    if (p.type === "minute") minute = Number(p.value);
  }
  if (dow === "Sat" || dow === "Sun") return "CLOSED";
  const hm = hour * 60 + minute;
  const rthOpen = 9 * 60 + 30;
  const rthClose = 16 * 60;
  const preOpen = 4 * 60;
  const postClose = 20 * 60;
  if (hm >= rthOpen && hm < rthClose) return "REGULAR";
  if (hm >= preOpen && hm < rthOpen) return "PRE_MARKET";
  if (hm >= rthClose && hm < postClose) return "POST_MARKET";
  return "CLOSED";
}

function parseQuoteItem(raw: unknown): MarketIndexQuote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const symbol = typeof o.symbol === "string" ? o.symbol : null;
  if (!symbol) return null;
  const shortName = typeof o.shortName === "string" ? o.shortName : typeof o.shortname === "string" ? o.shortname : symbol;
  return {
    symbol,
    shortName,
    price: pickNum(o.regularMarketPrice),
    changePercent: pickNum(o.regularMarketChangePercent),
  };
}

export function parseQuoteResponse(body: unknown): YahooQuoteAggregate {
  if (typeof body !== "object" || body === null) {
    return { errorMessage: "Invalid JSON", marketState: null, indexes: [] };
  }
  const qr = (body as Record<string, unknown>).quoteResponse;
  if (typeof qr !== "object" || qr === null) {
    return { errorMessage: "Missing quote response", marketState: null, indexes: [] };
  }
  const err = (qr as Record<string, unknown>).error;
  if (typeof err === "string" && err.length > 0) {
    return { errorMessage: err, marketState: null, indexes: [] };
  }
  const result = (qr as Record<string, unknown>).result;
  if (!Array.isArray(result)) {
    return { errorMessage: "Malformed quote results", marketState: null, indexes: [] };
  }

  let marketState: string | null = null;
  const indexes: MarketIndexQuote[] = [];
  for (const item of result) {
    const q = parseQuoteItem(item);
    if (!q) continue;
    indexes.push(q);
    const sym =
      typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).symbol === "string"
        ? ((item as Record<string, unknown>).symbol as string)
        : "";
    if (sym === "^GSPC" && typeof item === "object" && item !== null) {
      const ms = (item as Record<string, unknown>).marketState;
      if (typeof ms === "string") marketState = ms;
    }
  }

  if (indexes.length === 0) {
    return { errorMessage: "No index quotes parsed", marketState: null, indexes: [] };
  }

  const bySymbol = new Map(indexes.map((i) => [i.symbol, i] as const));
  const ordered: MarketIndexQuote[] = [];
  for (const sym of MAJOR_INDEX_SYMBOLS) {
    const row = bySymbol.get(sym);
    if (row) ordered.push(row);
  }

  if (!marketState) {
    for (const item of result) {
      if (typeof item === "object" && item !== null) {
        const ms = (item as Record<string, unknown>).marketState;
        if (typeof ms === "string") {
          marketState = ms;
          break;
        }
      }
    }
  }

  return { errorMessage: null, marketState, indexes: ordered.length > 0 ? ordered : indexes };
}

/** When v7 quote is blocked, chart meta still exposes price vs previous close. */
function parseIndexFromChartBody(body: unknown): (MarketIndexQuote & { marketState: string | null }) | null {
  if (typeof body !== "object" || body === null) return null;
  const chart = (body as Record<string, unknown>).chart;
  if (typeof chart !== "object" || chart === null) return null;
  const result = (chart as Record<string, unknown>).result;
  if (!Array.isArray(result) || result[0] === undefined) return null;
  const first = result[0] as Record<string, unknown>;
  const meta = first.meta;
  if (typeof meta !== "object" || meta === null) return null;
  const m = meta as Record<string, unknown>;
  const symbol = typeof m.symbol === "string" ? m.symbol : null;
  if (!symbol) return null;
  const shortName =
    typeof m.shortName === "string"
      ? m.shortName
      : typeof m.longName === "string"
        ? m.longName
        : symbol;
  const price = pickNum(m.regularMarketPrice);
  const prev = pickNum(m.chartPreviousClose) ?? pickNum(m.previousClose);
  let changePercent: number | null = null;
  if (price !== null && prev !== null && prev !== 0) {
    changePercent = ((price - prev) / prev) * 100;
  }
  const marketState = typeof m.marketState === "string" ? m.marketState : null;
  return {
    symbol,
    shortName,
    price,
    changePercent,
    marketState,
  };
}

async function fetchMajorIndexQuotesViaChart(): Promise<YahooQuoteAggregate> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)" };
  const tasks = [...MAJOR_INDEX_SYMBOLS].map(async (symbol) => {
    const url = new URL(`${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", "1d");
    url.searchParams.set("interval", "1d");
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
    const row = parseIndexFromChartBody(json);
    if (!row || !res.ok) return null;
    return row;
  });
  const rows = await Promise.all(tasks);

  let marketState: string | null = rows.find((r) => r?.symbol === "^GSPC")?.marketState ?? null;
  if (!marketState) {
    marketState = rows.find((r) => typeof r?.marketState === "string")?.marketState ?? null;
  }

  const indexes: MarketIndexQuote[] = [];
  for (const sym of MAJOR_INDEX_SYMBOLS) {
    const r = rows.find((x) => x?.symbol === sym);
    if (r) {
      indexes.push({ symbol: r.symbol, shortName: r.shortName, price: r.price, changePercent: r.changePercent });
    }
  }

  if (indexes.length === 0) {
    return { errorMessage: "No benchmark quotes", marketState: null, indexes: [] };
  }

  if (!marketState) {
    marketState = inferUsCashMarketStateUtc(Date.now());
  }

  return { errorMessage: null, marketState, indexes };
}

async function fetchMajorIndexQuotesViaV7(): Promise<YahooQuoteAggregate> {
  const url = new URL(YAHOO_QUOTE_URL);
  url.searchParams.set("symbols", [...MAJOR_INDEX_SYMBOLS].join(","));
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)" },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { errorMessage: `Invalid response (${res.status})`, marketState: null, indexes: [] };
  }
  const parsed = parseQuoteResponse(json);
  if (!res.ok) {
    return { ...parsed, errorMessage: parsed.errorMessage ?? `HTTP ${res.status}` };
  }
  return parsed;
}

/** v7 aggregate quote is often blocked; fall back to v8 chart meta per symbol (same pathway as `/api/prices`). */
export async function fetchMajorIndexQuotes(): Promise<YahooQuoteAggregate> {
  const v7 = await fetchMajorIndexQuotesViaV7();
  if (!v7.errorMessage && v7.indexes.length > 0) {
    return v7;
  }
  const viaChart = await fetchMajorIndexQuotesViaChart();
  if (viaChart.indexes.length > 0) {
    return { ...viaChart, errorMessage: null };
  }
  return {
    errorMessage: v7.errorMessage ?? viaChart.errorMessage ?? "No benchmark quotes",
    marketState: null,
    indexes: [],
  };
}
