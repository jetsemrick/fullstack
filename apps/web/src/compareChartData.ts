import type { GetPricesResponse, PricePoint } from "@stock/shared";

/** Distinct line colors for up to {@link MAX_COMPARE_TICKERS} series (Cursor accent first). */
export const COMPARE_SERIES_COLORS = [
  "#f54e00",
  "#2563eb",
  "#2b703e",
  "#9333ea",
  "#d97706",
] as const;

export type CompareChartRow = {
  /** Unix ms for Recharts time axis */
  t: number;
} & Record<string, number | undefined>;

/**
 * Percent change from the first point in the (already horizon-sliced) series.
 * Default normalization for multi-ticker compare (CURSOR-23).
 */
export function percentFromSeriesStart(close: number, firstClose: number): number {
  if (!Number.isFinite(firstClose) || firstClose === 0) return 0;
  return ((close - firstClose) / firstClose) * 100;
}

export function indexedPercentSeries(points: PricePoint[]): Map<number, number> {
  if (points.length === 0) return new Map();
  const firstClose = points[0]!.close;
  const map = new Map<number, number>();
  for (const p of points) {
    map.set(p.timestamp, percentFromSeriesStart(p.close, firstClose));
  }
  return map;
}

/** Union of timestamps across series, sorted ascending. */
export function unionTimestamps(seriesList: PricePoint[][]): number[] {
  const set = new Set<number>();
  for (const series of seriesList) {
    for (const p of series) set.add(p.timestamp);
  }
  return [...set].sort((a, b) => a - b);
}

export function buildCompareChartRows(
  datasets: { ticker: string; series: PricePoint[] }[],
): { rows: CompareChartRow[]; tickers: string[] } {
  const tickers = datasets.map((d) => d.ticker);
  const indexed = datasets.map((d) => ({
    ticker: d.ticker,
    byTs: indexedPercentSeries(d.series),
  }));
  const timestamps = unionTimestamps(datasets.map((d) => d.series));
  const rows: CompareChartRow[] = timestamps.map((ts) => {
    const row: CompareChartRow = { t: ts * 1000 };
    for (const { ticker, byTs } of indexed) {
      const v = byTs.get(ts);
      if (v !== undefined) row[ticker] = v;
    }
    return row;
  });
  return { rows, tickers };
}

export type LoadedTickerResult =
  | { ticker: string; ok: true; data: GetPricesResponse }
  | { ticker: string; ok: false; error: string };

export function summarizeLoadResults(results: LoadedTickerResult[]): {
  successes: GetPricesResponse[];
  failures: { ticker: string; error: string }[];
} {
  const successes: GetPricesResponse[] = [];
  const failures: { ticker: string; error: string }[] = [];
  for (const r of results) {
    if (r.ok) successes.push(r.data);
    else failures.push({ ticker: r.ticker, error: r.error });
  }
  return { successes, failures };
}
