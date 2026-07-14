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

export type ComparisonSeriesInput = {
  ticker: string;
  currency: string | null;
  series: PricePoint[];
};

export type ComparisonSeriesMeta = {
  ticker: string;
  currency: string | null;
  colorIndex: number;
};

export type ComparisonWideRow = {
  t: number;
} & Record<string, number | null>;

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

export function buildComparisonRows(inputs: ComparisonSeriesInput[]): {
  rows: ComparisonWideRow[];
  meta: ComparisonSeriesMeta[];
} {
  if (inputs.length === 0) return { rows: [], meta: [] };

  const timestampSet = new Set<number>();
  const priceMaps = new Map<string, Map<number, number>>();

  for (const input of inputs) {
    const map = new Map<number, number>();
    for (const point of input.series) {
      timestampSet.add(point.timestamp);
      map.set(point.timestamp, point.close);
    }
    priceMaps.set(input.ticker, map);
  }

  const tickers = inputs.map((input) => input.ticker);
  const timestamps = Array.from(timestampSet).sort((a, b) => a - b);

  const rows: ComparisonWideRow[] = timestamps.map((timestamp) => {
    const row: ComparisonWideRow = { t: timestamp * 1000 };
    for (const ticker of tickers) {
      row[ticker] = priceMaps.get(ticker)?.get(timestamp) ?? null;
    }
    return row;
  });

  const meta: ComparisonSeriesMeta[] = inputs.map((input, index) => ({
    ticker: input.ticker,
    currency: input.currency,
    colorIndex: index,
  }));

  return { rows, meta };
}

export function hasMixedCurrencies(meta: ComparisonSeriesMeta[]): boolean {
  const currencies = new Set(
    meta.map((entry) => entry.currency).filter((currency): currency is string => currency != null),
  );
  return currencies.size > 1;
}

function rowMaxPrice(row: ComparisonWideRow, tickers: string[]): number {
  let max = -Infinity;
  for (const ticker of tickers) {
    const value = row[ticker];
    if (typeof value === "number" && value > max) max = value;
  }
  return max === -Infinity ? 0 : max;
}

function rowMinPrice(row: ComparisonWideRow, tickers: string[]): number {
  let min = Infinity;
  for (const ticker of tickers) {
    const value = row[ticker];
    if (typeof value === "number" && value < min) min = value;
  }
  return min === Infinity ? 0 : min;
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

export function downsampleWideRows(
  rows: ComparisonWideRow[],
  tickers: string[],
  maxRows: number,
): ComparisonWideRow[] {
  if (rows.length <= maxRows || tickers.length === 0) return rows;

  const result: ComparisonWideRow[] = [rows[0]!];
  const bucketCount = maxRows - 2;
  const bucketSize = (rows.length - 2) / bucketCount;

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = 1 + Math.floor(bucket * bucketSize);
    const end = Math.min(rows.length - 1, 1 + Math.floor((bucket + 1) * bucketSize));
    if (end <= start) continue;

    let min = rows[start]!;
    let max = rows[start]!;
    let minVal = rowMinPrice(min, tickers);
    let maxVal = rowMaxPrice(max, tickers);

    for (let i = start + 1; i < end; i++) {
      const row = rows[i]!;
      const rowMin = rowMinPrice(row, tickers);
      const rowMax = rowMaxPrice(row, tickers);
      if (rowMin < minVal) {
        min = row;
        minVal = rowMin;
      }
      if (rowMax > maxVal) {
        max = row;
        maxVal = rowMax;
      }
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
