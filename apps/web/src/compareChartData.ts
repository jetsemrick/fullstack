import type { GetPricesResponse } from "@stock/shared";
import { downsampleRows } from "./priceChartData";

export type CompareNormalization = "indexed" | "absolute";

export type CompareChartRow = {
  t: number;
  [ticker: string]: number;
};

export const MAX_COMPARE_TICKERS = 5;

export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

export type AlignedSeries = {
  timestamps: number[];
  byTicker: Map<string, number[]>;
};

/** Inner-join price series on Unix timestamp (seconds). */
export function alignSeries(responses: GetPricesResponse[]): AlignedSeries {
  if (responses.length === 0) {
    return { timestamps: [], byTicker: new Map() };
  }

  const maps = responses.map((r) => {
    const m = new Map<number, number>();
    for (const p of r.series) {
      m.set(p.timestamp, p.close);
    }
    return { ticker: r.ticker, map: m };
  });

  let common = new Set(maps[0]!.map.keys());
  for (let i = 1; i < maps.length; i++) {
    const next = new Set<number>();
    for (const ts of common) {
      if (maps[i]!.map.has(ts)) next.add(ts);
    }
    common = next;
  }

  const timestamps = [...common].sort((a, b) => a - b);
  const byTicker = new Map<string, number[]>();
  for (const { ticker, map } of maps) {
    byTicker.set(
      ticker,
      timestamps.map((ts) => map.get(ts)!),
    );
  }

  return { timestamps, byTicker };
}

/** Rebase values so the first point equals `base` (default 100). */
export function normalizeToIndex(values: number[], base = 100): number[] {
  if (values.length === 0) return [];
  const first = values[0]!;
  if (!first) return values.map(() => base);
  const scale = base / first;
  return values.map((v) => v * scale);
}

export type BuildCompareRowsOptions = {
  mode: CompareNormalization;
};

/** Build wide Recharts rows from aligned responses. Single response uses absolute close prices. */
export function buildCompareRows(
  responses: GetPricesResponse[],
  options: BuildCompareRowsOptions = { mode: "indexed" },
): CompareChartRow[] {
  if (responses.length === 0) return [];

  if (responses.length === 1) {
    const r = responses[0]!;
    return r.series.map((p) => ({
      t: p.timestamp * 1000,
      [r.ticker]: p.close,
    }));
  }

  const { timestamps, byTicker } = alignSeries(responses);
  if (timestamps.length === 0) return [];

  const mode = options.mode;
  const normalized = new Map<string, number[]>();
  for (const [ticker, values] of byTicker) {
    normalized.set(ticker, mode === "indexed" ? normalizeToIndex(values) : values);
  }

  return timestamps.map((ts, i) => {
    const row: CompareChartRow = { t: ts * 1000 };
    for (const [ticker, values] of normalized) {
      row[ticker] = values[i]!;
    }
    return row;
  });
}

export type CompareSeriesMeta = {
  ticker: string;
  color: string;
};

export function buildCompareSeriesMeta(tickers: string[]): CompareSeriesMeta[] {
  return tickers.map((ticker, i) => ({
    ticker,
    color: seriesColor(i),
  }));
}

/** Downsample merged compare rows using the primary ticker's extrema per bucket. */
export function downsampleCompareRows(
  rows: CompareChartRow[],
  tickers: string[],
  maxRows: number,
): CompareChartRow[] {
  if (rows.length <= maxRows || tickers.length === 0) return rows;
  const primary = tickers[0]!;
  const primaryChartRows = rows.map((r) => ({ t: r.t, price: r[primary] as number }));
  const sampled = downsampleRows(primaryChartRows, maxRows);
  const sampledTimes = new Set(sampled.map((r) => r.t));
  return rows.filter((r) => sampledTimes.has(r.t));
}
