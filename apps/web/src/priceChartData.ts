import { MAX_COMPARE_TICKERS, type GetPricesResponse, type PricePoint } from "@stock/shared";

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

/** Distinct, accessible line colors for multi-ticker comparison (max 5). */
export const COMPARE_LINE_COLORS = [
  "var(--accent)",
  "#2563eb",
  "#9333ea",
  "#ca8a04",
  "#0891b2",
] as const;

export type ComparisonRow = {
  t: number;
  [ticker: string]: number | null;
};

export type NormalizedPoint = {
  timestamp: number;
  value: number | null;
};

export type TickerFetchResult =
  | { ticker: string; ok: true; data: GetPricesResponse }
  | { ticker: string; ok: false; error: string };

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

/** Align multiple series on a shared timestamp index; gaps become null. */
export function buildComparisonRows(seriesByTicker: Record<string, NormalizedPoint[]>): ComparisonRow[] {
  const allTimestamps = new Set<number>();
  for (const points of Object.values(seriesByTicker)) {
    for (const p of points) allTimestamps.add(p.timestamp);
  }
  const sorted = [...allTimestamps].sort((a, b) => a - b);
  return sorted.map((ts) => {
    const row: ComparisonRow = { t: ts * 1000 };
    for (const [ticker, points] of Object.entries(seriesByTicker)) {
      const point = points.find((p) => p.timestamp === ts);
      row[ticker] = point?.value ?? null;
    }
    return row;
  });
}

/** Convert closes to percent change from the first visible point (first value is 0). */
export function normalizeComparisonSeries(series: PricePoint[]): NormalizedPoint[] {
  if (series.length === 0) return [];
  const firstClose = series[0]?.close;
  if (firstClose == null || firstClose === 0) {
    return series.map((p) => ({ timestamp: p.timestamp, value: null }));
  }
  return series.map((p, index) => ({
    timestamp: p.timestamp,
    value: index === 0 ? 0 : ((p.close - firstClose) / firstClose) * 100,
  }));
}

export function createCompareTickerList(
  existing: string[],
  input: string,
  maxCap: number = MAX_COMPARE_TICKERS,
): { tickers: string[]; error?: string } {
  const normalized = input.trim().toUpperCase();
  if (!normalized) return { tickers: existing, error: "Enter a ticker symbol" };
  if (existing.includes(normalized)) {
    return { tickers: existing, error: `${normalized} is already on the chart` };
  }
  if (existing.length >= maxCap) {
    return { tickers: existing, error: `Maximum ${maxCap} tickers allowed` };
  }
  return { tickers: [...existing, normalized] };
}

export function summarizeComparisonResults(results: TickerFetchResult[]): {
  successful: GetPricesResponse[];
  failures: { ticker: string; error: string }[];
} {
  const successful: GetPricesResponse[] = [];
  const failures: { ticker: string; error: string }[] = [];
  for (const result of results) {
    if (result.ok) successful.push(result.data);
    else failures.push({ ticker: result.ticker, error: result.error });
  }
  return { successful, failures };
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
