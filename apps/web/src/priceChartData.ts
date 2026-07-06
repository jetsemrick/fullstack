import type { GetPricesResponse, PricePoint } from "@stock/shared";

export const MAX_COMPARE_TICKERS = 5;

export const SERIES_COLOR_VARS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
] as const;

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

/** Recharts row: union timestamp plus one nullable price column per ticker. */
export type MultiChartRow = { t: number } & Record<string, number | null>;

export type ChartSeriesMeta = {
  ticker: string;
  color: string;
};

export function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

export function seriesColorVar(index: number): string {
  return SERIES_COLOR_VARS[index % SERIES_COLOR_VARS.length] ?? SERIES_COLOR_VARS[0];
}

export type AddTickerResult =
  | { tickers: string[]; rejected?: undefined }
  | { tickers: string[]; rejected: "duplicate" | "cap" };

/** Append a ticker when under cap and not already present. */
export function addTickerToList(
  tickers: string[],
  candidate: string,
  max = MAX_COMPARE_TICKERS,
): AddTickerResult {
  const t = normalizeTickerInput(candidate);
  if (!t) return { tickers };
  if (tickers.includes(t)) return { tickers, rejected: "duplicate" };
  if (tickers.length >= max) return { tickers, rejected: "cap" };
  return { tickers: [...tickers, t] };
}

export function removeTickerFromList(tickers: string[], ticker: string): string[] {
  return tickers.filter((t) => t !== ticker);
}

export function responseToChartRows(data: GetPricesResponse): ChartRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));
}

/** Align series on sorted union of timestamps; missing bars become null gaps. */
export function mergeSeriesByUnionTimestamps(
  seriesList: { ticker: string; rows: ChartRow[] }[],
): MultiChartRow[] {
  if (seriesList.length === 0) return [];

  const byTicker = new Map<string, Map<number, number>>();
  const allTimes = new Set<number>();

  for (const { ticker, rows } of seriesList) {
    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(row.t, row.price);
      allTimes.add(row.t);
    }
    byTicker.set(ticker, map);
  }

  const sortedTimes = [...allTimes].sort((a, b) => a - b);
  return sortedTimes.map((t) => {
    const row: MultiChartRow = { t };
    for (const { ticker } of seriesList) {
      const price = byTicker.get(ticker)?.get(t);
      row[ticker] = price ?? null;
    }
    return row;
  });
}

export function buildMultiSeriesChartPayload(
  responses: { ticker: string; data: GetPricesResponse }[],
  options?: { downsampleMax?: number },
): { rows: MultiChartRow[]; series: ChartSeriesMeta[] } | null {
  if (responses.length === 0) return null;

  const maxRows = options?.downsampleMax;
  const inputs = responses.map(({ ticker, data }, index) => ({
    ticker,
    rows: responseToChartRows(data),
    color: seriesColorVar(index),
  }));

  let rows = mergeSeriesByUnionTimestamps(inputs.map(({ ticker, rows }) => ({ ticker, rows })));
  if (maxRows != null && maxRows > 0) {
    rows = downsampleMultiChartRows(rows, maxRows);
  }
  const series: ChartSeriesMeta[] = inputs.map(({ ticker, color }) => ({ ticker, color }));
  return { rows, series };
}

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

/** Downsample merged multi-ticker rows while preserving shared timestamps. */
export function downsampleMultiChartRows(rows: MultiChartRow[], maxRows: number): MultiChartRow[] {
  if (rows.length <= maxRows) return rows;

  const result: MultiChartRow[] = [rows[0]!];
  const bucketCount = maxRows - 2;
  const bucketSize = (rows.length - 2) / bucketCount;

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor(bucket * bucketSize);
    const end = Math.min(rows.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
    if (end <= start) continue;
    const mid = Math.floor((start + end) / 2);
    result.push(rows[mid]!);
  }

  result.push(rows[rows.length - 1]!);
  return result;
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
