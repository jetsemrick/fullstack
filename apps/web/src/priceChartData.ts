import type { GetPricesResponse, PricePoint } from "@stock/shared";

export const MAX_COMPARE_TICKERS = 5;

/** Accessible distinct colors for multi-ticker lines. */
export const COMPARE_LINE_COLORS = [
  "var(--accent)",
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
] as const;

const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export type CompareTickerListResult =
  | { ok: true; tickers: string[] }
  | { ok: false; error: string; tickers: string[] };

export function createCompareTickerList(currentTickers: string[], input: string): CompareTickerListResult {
  const t = normalizeTickerInput(input);
  if (!t) {
    return { ok: false, error: "Enter a ticker symbol.", tickers: currentTickers };
  }
  if (!TICKER_RE.test(t)) {
    return { ok: false, error: "Invalid ticker format.", tickers: currentTickers };
  }
  if (currentTickers.includes(t)) {
    return { ok: false, error: `${t} is already on the chart.`, tickers: currentTickers };
  }
  if (currentTickers.length >= MAX_COMPARE_TICKERS) {
    return { ok: false, error: `Maximum ${MAX_COMPARE_TICKERS} tickers.`, tickers: currentTickers };
  }
  return { ok: true, tickers: [...currentTickers, t] };
}

export function getCompareLineColor(index: number): string {
  return COMPARE_LINE_COLORS[index % COMPARE_LINE_COLORS.length]!;
}

/** Recharts row: timestamp ms plus one nullable price column per ticker. */
export type ComparisonRow = { t: number } & Record<string, number | null>;

export function buildComparisonRows(
  seriesByTicker: Record<string, { timestamp: number; close: number }[]>,
): ComparisonRow[] {
  const allTimestamps = new Set<number>();
  for (const series of Object.values(seriesByTicker)) {
    for (const p of series) {
      allTimestamps.add(p.timestamp);
    }
  }
  const sorted = Array.from(allTimestamps).sort((a, b) => a - b);
  const lookup: Record<string, Map<number, number>> = {};
  for (const [ticker, series] of Object.entries(seriesByTicker)) {
    lookup[ticker] = new Map(series.map((p) => [p.timestamp, p.close]));
  }
  return sorted.map((ts) => {
    const row: ComparisonRow = { t: ts * 1000 };
    for (const ticker of Object.keys(seriesByTicker)) {
      row[ticker] = lookup[ticker]?.get(ts) ?? null;
    }
    return row;
  });
}

export type TickerFetchResult =
  | { ticker: string; ok: true; data: GetPricesResponse }
  | { ticker: string; ok: false; error: string };

export function summarizeComparisonResults(results: TickerFetchResult[]): {
  successful: GetPricesResponse[];
  failures: { ticker: string; error: string }[];
} {
  const successful: GetPricesResponse[] = [];
  const failures: { ticker: string; error: string }[] = [];
  for (const r of results) {
    if (r.ok) successful.push(r.data);
    else failures.push({ ticker: r.ticker, error: r.error });
  }
  return { successful, failures };
}

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export function seriesHasVolume(series: PricePoint[]): boolean {
  return series.some((p) => p.volume != null);
}

export function buildPriceVolumeRows(data: GetPricesResponse): PriceVolumeRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    volume: p.volume,
    volumeBar: p.volume ?? 0,
  }));
}

export function formatVolumeAxis(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatVolumeTooltip(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
