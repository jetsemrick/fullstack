import type { SearchResult, SearchResultType } from "@stock/shared";
import { SEARCH_MAX_RESULTS } from "@stock/shared";

const YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search";
/** Yahoo filters by type after ranking, so ask for more than we return. */
const UPSTREAM_QUOTES_COUNT = 20;
const UPSTREAM_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 500;

const ALLOWED_TYPES: ReadonlySet<string> = new Set<SearchResultType>(["EQUITY", "ETF", "INDEX"]);
const SYMBOL_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export type YahooSearchResult = {
  errorMessage: string | null;
  results: SearchResult[];
};

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Keeps stocks, ETFs, and indexes in Yahoo's ranked order, deduped by symbol, capped at `SEARCH_MAX_RESULTS`. */
export function parseSearchResponse(body: unknown): YahooSearchResult {
  if (typeof body !== "object" || body === null) {
    return { errorMessage: "Invalid JSON", results: [] };
  }
  const quotes = (body as Record<string, unknown>).quotes;
  if (!Array.isArray(quotes)) {
    return { errorMessage: "Missing quotes", results: [] };
  }
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const raw of quotes) {
    if (results.length >= SEARCH_MAX_RESULTS) break;
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const type = pickString(o.quoteType);
    const symbol = pickString(o.symbol);
    if (!type || !ALLOWED_TYPES.has(type) || !symbol || !SYMBOL_RE.test(symbol)) continue;
    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      symbol: key,
      name: (pickString(o.longname) ?? pickString(o.shortname) ?? key).replace(/\s+/g, " "),
      type: type as SearchResultType,
      exchange: pickString(o.exchDisp),
    });
  }
  return { errorMessage: null, results };
}

const cache = new Map<string, { results: SearchResult[]; fetchedAt: number }>();

export function clearSearchCache(): void {
  cache.clear();
}

/** `query` must already be validated and normalized by the caller. */
export async function fetchYahooSearch(query: string): Promise<YahooSearchResult> {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { errorMessage: null, results: hit.results };
  }

  const url = new URL(YAHOO_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("quotesCount", String(UPSTREAM_QUOTES_COUNT));
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("listsCount", "0");
  url.searchParams.set("enableFuzzyQuery", "false");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StockVisualizer/1.0)" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { errorMessage: timedOut ? "Search timed out" : "Search request failed", results: [] };
  }
  if (!res.ok) {
    return { errorMessage: `HTTP ${res.status}`, results: [] };
  }
  let json: unknown;
  try {
    json = JSON.parse(await res.text()) as unknown;
  } catch {
    return { errorMessage: "Invalid response", results: [] };
  }
  const parsed = parseSearchResponse(json);
  if (!parsed.errorMessage) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { results: parsed.results, fetchedAt: Date.now() });
  }
  return parsed;
}
