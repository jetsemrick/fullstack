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

export type OhlcChartRow = ChartRow & {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  wickRange: [number, number];
  bodyRange: [number, number];
  isUp: boolean;
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

export function buildOhlcChartRows(data: GetPricesResponse): OhlcChartRow[] {
  return data.series.map((p) => toOhlcChartRow(p.timestamp * 1000, p.open, p.high, p.low, p.close, p.volume));
}

export function downsampleRows<TRow extends ChartRow>(rows: TRow[], maxRows: number): TRow[] {
  if (rows.length <= maxRows) return rows;

  const result: TRow[] = [rows[0]!];
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

export function downsampleOhlcRows(rows: OhlcChartRow[], maxRows: number): OhlcChartRow[] {
  if (rows.length <= maxRows) return rows;
  if (maxRows <= 0) return [];

  const result: OhlcChartRow[] = [];
  const bucketSize = rows.length / maxRows;

  for (let bucket = 0; bucket < maxRows; bucket++) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(rows.length, Math.floor((bucket + 1) * bucketSize));
    const bucketRows = rows.slice(start, Math.max(start + 1, end));
    result.push(aggregateOhlcRows(bucketRows));
  }

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

function aggregateOhlcRows(rows: OhlcChartRow[]): OhlcChartRow {
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const high = Math.max(...rows.map((row) => row.high));
  const low = Math.min(...rows.map((row) => row.low));
  const volume = rows.reduce<number | null>((sum, row) => {
    if (row.volume == null) return sum;
    return (sum ?? 0) + row.volume;
  }, null);

  return toOhlcChartRow(first.t, first.open, high, low, last.close, volume);
}

function toOhlcChartRow(
  t: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | null,
): OhlcChartRow {
  return {
    t,
    price: close,
    open,
    high,
    low,
    close,
    volume,
    wickRange: [low, high],
    bodyRange: [Math.min(open, close), Math.max(open, close)],
    isUp: close >= open,
  };
}
