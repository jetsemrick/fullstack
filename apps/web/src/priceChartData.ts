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

export type IndexedChartRow = {
  t: number;
} & Record<string, number>;

export type TickerSeriesInput = {
  ticker: string;
  series: PricePoint[];
};

export type AlignAndIndexResult = {
  rows: IndexedChartRow[];
  tickers: string[];
};

export const MAX_COMPARE_TICKERS_TOTAL = 5;

export function normalizeCompareTickers(
  primary: string,
  candidates: string[],
  maxTotal = MAX_COMPARE_TICKERS_TOTAL,
): string[] {
  const primaryNorm = primary.trim().toUpperCase();
  const maxCompare = Math.max(0, maxTotal - 1);
  const seen = new Set<string>(primaryNorm ? [primaryNorm] : []);
  const result: string[] = [];

  for (const raw of candidates) {
    const ticker = raw.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    result.push(ticker);
    if (result.length >= maxCompare) break;
  }

  return result;
}

export function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export function alignAndIndexSeries(inputs: TickerSeriesInput[]): AlignAndIndexResult {
  if (inputs.length === 0) return { rows: [], tickers: [] };

  const tickers: string[] = [];
  const closeByTimestamp = new Map<number, Map<string, number>>();

  for (const { ticker, series } of inputs) {
    if (!series.length) continue;
    tickers.push(ticker);
    for (const point of series) {
      if (!Number.isFinite(point.close)) continue;
      let row = closeByTimestamp.get(point.timestamp);
      if (!row) {
        row = new Map<string, number>();
        closeByTimestamp.set(point.timestamp, row);
      }
      row.set(ticker, point.close);
    }
  }

  if (tickers.length === 0) return { rows: [], tickers: [] };

  const timestamps = [...closeByTimestamp.keys()].sort((a, b) => a - b);
  const intersectionTimestamps = timestamps.filter((timestamp) => {
    const row = closeByTimestamp.get(timestamp);
    return row != null && tickers.every((ticker) => row.has(ticker));
  });

  if (intersectionTimestamps.length === 0) return { rows: [], tickers };

  const firstTimestamp = intersectionTimestamps[0]!;
  const firstRow = closeByTimestamp.get(firstTimestamp)!;
  const validTickers = tickers.filter((ticker) => {
    const baseClose = firstRow.get(ticker);
    return baseClose != null && Number.isFinite(baseClose) && baseClose !== 0;
  });

  if (validTickers.length === 0) return { rows: [], tickers: [] };

  const baseCloseByTicker = new Map<string, number>();
  for (const ticker of validTickers) {
    baseCloseByTicker.set(ticker, firstRow.get(ticker)!);
  }

  const rows: IndexedChartRow[] = intersectionTimestamps.map((timestamp) => {
    const closes = closeByTimestamp.get(timestamp)!;
    const row: IndexedChartRow = { t: timestamp * 1000 };
    for (const ticker of validTickers) {
      const close = closes.get(ticker)!;
      const baseClose = baseCloseByTicker.get(ticker)!;
      row[ticker] = (close / baseClose) * 100;
    }
    return row;
  });

  return { rows, tickers: validTickers };
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

export function downsampleRows<T extends { t: number }>(
  rows: T[],
  maxRows: number,
  getValue: (row: T) => number = (row) => (row as unknown as ChartRow).price,
): T[] {
  if (rows.length <= maxRows) return rows;

  const result: T[] = [rows[0]!];
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
      if (getValue(row) < getValue(min)) min = row;
      if (getValue(row) > getValue(max)) max = row;
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
