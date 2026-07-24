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

/** Wide row for multi-ticker compare charts (indexed values keyed by ticker). */
export type CompareChartRow = {
  t: number;
  [ticker: string]: number | null;
};

export type TickerCloseSeries = {
  ticker: string;
  points: ReadonlyArray<{ timestamp: number; close: number }>;
};

export type AlignedTickerSeries = {
  ticker: string;
  aligned: Array<{ timestamp: number; close: number | null }>;
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

export function alignSeriesOnTimestamps(inputs: TickerCloseSeries[]): AlignedTickerSeries[] {
  const allTimestamps = new Set<number>();
  for (const input of inputs) {
    for (const point of input.points) {
      allTimestamps.add(point.timestamp);
    }
  }
  const timestamps = [...allTimestamps].sort((a, b) => a - b);

  return inputs.map((input) => {
    const byTimestamp = new Map(input.points.map((point) => [point.timestamp, point.close]));
    return {
      ticker: input.ticker,
      aligned: timestamps.map((timestamp) => ({
        timestamp,
        close: byTimestamp.get(timestamp) ?? null,
      })),
    };
  });
}

export function indexSeriesTo100(aligned: AlignedTickerSeries[]): CompareChartRow[] {
  if (aligned.length === 0) return [];

  const timestamps = aligned[0]!.aligned.map((point) => point.timestamp);
  const bases = new Map<string, number>();

  for (const { ticker, aligned: points } of aligned) {
    const first = points.find((point) => point.close != null && point.close !== 0);
    if (first?.close != null) {
      bases.set(ticker, first.close);
    }
  }

  return timestamps.map((timestamp, index) => {
    const row: CompareChartRow = { t: timestamp * 1000 };
    for (const { ticker, aligned: points } of aligned) {
      const close = points[index]?.close ?? null;
      const base = bases.get(ticker);
      if (close == null || base == null || base === 0) {
        row[ticker] = null;
      } else {
        row[ticker] = (100 * close) / base;
      }
    }
    return row;
  });
}

export function buildIndexedCompareRows(responses: GetPricesResponse[]): CompareChartRow[] {
  const inputs: TickerCloseSeries[] = responses.map((response) => ({
    ticker: response.ticker,
    points: response.series.map((point) => ({
      timestamp: point.timestamp,
      close: point.close,
    })),
  }));
  return indexSeriesTo100(alignSeriesOnTimestamps(inputs));
}

export function downsampleWideRows(
  rows: CompareChartRow[],
  tickerKeys: string[],
  maxRows: number,
): CompareChartRow[] {
  if (rows.length <= maxRows || tickerKeys.length === 0) return rows;

  const primaryKey = tickerKeys[0]!;
  const chartRows: ChartRow[] = rows.map((row) => ({
    t: row.t,
    price: typeof row[primaryKey] === "number" ? row[primaryKey]! : Number.NaN,
  }));

  const finiteRows = chartRows.filter((row) => Number.isFinite(row.price));
  if (finiteRows.length === 0) return rows;

  const sampledTs = new Set(downsampleRows(finiteRows, maxRows).map((row) => row.t));
  return rows.filter((row) => sampledTs.has(row.t));
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
