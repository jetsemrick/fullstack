import type { GetPricesResponse, PricePoint } from "@stock/shared";

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

/** Max tickers on one comparison chart (client + UI cap). */
export const COMPARISON_TICKER_LIMIT = 5;

/** CSS tokens for comparison line colors (`index.css`). */
export const CHART_SERIES_COLOR_VARS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
] as const;

export type ComparisonValueMode = "percent" | "raw";

export type ComparisonSeriesMeta = {
  /** Recharts `dataKey` (ASCII, no special chars) */
  dataKey: string;
  ticker: string;
  stroke: string;
};

export type ComparisonChartRow = Record<string, unknown> & { t: number };

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

/** Same horizon slicing as main app: last `horizonDays` of calendar time from latest bar. */
export function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export function normalizeCompareTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Enforce cap; dedupe preserving first occurrence order. */
export function capUniqueTickers(tickers: string[], limit = COMPARISON_TICKER_LIMIT): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tickers) {
    const u = normalizeCompareTickerInput(t);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

/** Map each ordered ticker to stable dataKey + stroke for Recharts. */
export function buildComparisonSeriesMeta(tickers: string[]): ComparisonSeriesMeta[] {
  return tickers.map((ticker, i) => ({
    dataKey: `cmp${i}`,
    ticker,
    stroke: CHART_SERIES_COLOR_VARS[i % CHART_SERIES_COLOR_VARS.length]!,
  }));
}

/** Per-ticker close lookup for union timestamp merge. */
function buildCloseByTimestamp(series: PricePoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of series) {
    if (typeof p.timestamp === "number" && Number.isFinite(p.close)) {
      m.set(p.timestamp, p.close);
    }
  }
  return m;
}

/** First chronological close in series (baseline for % change). */
function firstBaselineClose(series: PricePoint[]): number | null {
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp);
  for (const p of sorted) {
    if (typeof p.close === "number" && Number.isFinite(p.close) && p.close !== 0) {
      return p.close;
    }
  }
  return null;
}

/**
 * Union of timestamps across series, sorted ascending; each row holds `t` in ms and
 * one field per series (`cmp0`, `cmp1`, …) — number or null when missing at that bar.
 */
export function buildComparisonChartRows(
  tickersOrdered: string[],
  responseByTicker: Map<string, GetPricesResponse>,
  mode: ComparisonValueMode,
): ComparisonChartRow[] {
  if (tickersOrdered.length === 0) return [];

  const maps = new Map<string, Map<number, number>>();
  const baselines = new Map<string, number | null>();

  for (const t of tickersOrdered) {
    const data = responseByTicker.get(t);
    const series = data?.series ?? [];
    maps.set(t, buildCloseByTimestamp(series));
    baselines.set(t, firstBaselineClose(series));
  }

  const tsSet = new Set<number>();
  for (const t of tickersOrdered) {
    for (const ts of maps.get(t)!.keys()) {
      tsSet.add(ts);
    }
  }
  const sortedTs = [...tsSet].sort((a, b) => a - b);

  const meta = buildComparisonSeriesMeta(tickersOrdered);
  const rows: ComparisonChartRow[] = [];

  for (const ts of sortedTs) {
    const row: ComparisonChartRow = { t: ts * 1000 };
    for (let i = 0; i < tickersOrdered.length; i++) {
      const ticker = tickersOrdered[i]!;
      const dataKey = meta[i]!.dataKey;
      const close = maps.get(ticker)!.get(ts);
      if (close === undefined) {
        row[dataKey] = null;
        continue;
      }
      if (mode === "raw") {
        row[dataKey] = close;
      } else {
        const base = baselines.get(ticker);
        if (base == null || base === 0) {
          row[dataKey] = null;
        } else {
          row[dataKey] = ((close / base) - 1) * 100;
        }
      }
    }
    rows.push(row);
  }

  return rows;
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
