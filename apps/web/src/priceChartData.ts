import type { GetPricesResponse, PricePoint } from "@stock/shared";

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export type ChartRow = {
  t: number;
  price: number;
};

export type MultiSeriesRow = {
  t: number;
  [ticker: string]: number | undefined;
};

export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
] as const;

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

export function alignAndIndexSeries(
  datasets: GetPricesResponse[],
  mode: "absolute" | "indexed",
): { rows: MultiSeriesRow[]; tickers: string[] } {
  const tickers = datasets.map((d) => d.ticker);
  const byTimestamp = new Map<number, MultiSeriesRow>();

  for (const dataset of datasets) {
    if (dataset.series.length === 0) continue;
    const firstClose = dataset.series[0]!.close;
    const indexBase = mode === "indexed" && firstClose !== 0 ? firstClose : null;

    for (const point of dataset.series) {
      const t = point.timestamp * 1000;
      const value =
        indexBase != null ? (100 * point.close) / indexBase : point.close;
      const row = byTimestamp.get(t) ?? { t };
      row[dataset.ticker] = value;
      byTimestamp.set(t, row);
    }
  }

  const rows = [...byTimestamp.values()].sort((a, b) => a.t - b.t);
  return { rows, tickers };
}

export function downsampleMultiRows(
  rows: MultiSeriesRow[],
  tickers: string[],
  maxRows: number,
): MultiSeriesRow[] {
  if (rows.length <= maxRows || tickers.length === 0) return rows;

  const asChartRows: ChartRow[] = rows.map((row) => {
    let sum = 0;
    let count = 0;
    for (const ticker of tickers) {
      const val = row[ticker];
      if (typeof val === "number" && Number.isFinite(val)) {
        sum += val;
        count++;
      }
    }
    return {
      t: row.t,
      price: count > 0 ? sum / count : 0,
    };
  });
  const sampledTimes = new Set(downsampleRows(asChartRows, maxRows).map((r) => r.t));
  return rows.filter((row) => sampledTimes.has(row.t));
}

export function downsampleRows(rows: ChartRow[], maxRows: number): ChartRow[] {
  if (rows.length <= maxRows) return rows;

  const result: ChartRow[] = [rows[0]!];
  const bucketCount = maxRows - 2;
  const bucketSize = (rows.length - 2) / bucketCount;

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor(bucket * bucketSize);
    const end = Math.min(rows.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
    if (end <= start) continue;

    let min = rows[start]!;
    let max = rows[start]!;
    for (let i = start + 1; i < end; i++) {
      const row = rows[i]!;
      if (row.price < min.price) min = row;
      if (row.price > max.price) max = row;
    }

    if (min.t < max.t) {
      result.push(min, max);
    } else if (max.t < min.t) {
      result.push(max, min);
    } else {
      result.push(min);
    }
  }

  result.push(rows[rows.length - 1]!);
  return result;
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
