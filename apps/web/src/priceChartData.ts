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

export type YScale = "linear" | "log";

export type LogAxis = {
  domain: [number, number];
  ticks: number[];
};

const MAX_LOG_TICKS = 10;

/** Mantissa sets per decade, densest first; the densest set that fits MAX_LOG_TICKS wins. */
const LOG_MANTISSAS: number[][] = [
  [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8],
  [1, 1.5, 2, 3, 5, 7],
  [1, 2, 5],
  [1, 3],
  [1],
];

function cleanFloat(n: number): number {
  return Number(n.toPrecision(12));
}

function logCandidates(min: number, max: number, mantissas: number[], decadeStep = 1): number[] {
  const first = Math.floor(Math.log10(min)) - 1;
  const last = Math.ceil(Math.log10(max)) + 1;
  const out: number[] = [];
  for (let e = first; e <= last; e += decadeStep) {
    for (const m of mantissas) out.push(cleanFloat(m * 10 ** e));
  }
  return out;
}

function snapToCandidates(min: number, max: number, candidates: number[]): LogAxis {
  let lo = candidates[0]!;
  let hi = candidates[candidates.length - 1]!;
  for (const c of candidates) if (c <= min) lo = c;
  for (let i = candidates.length - 1; i >= 0; i--) if (candidates[i]! >= max) hi = candidates[i]!;
  return { domain: [lo, hi], ticks: candidates.filter((c) => c >= lo && c <= hi) };
}

/**
 * Log y-axis domain and gridlines at round prices (1-2-5 style) spanning the given positive range.
 * Returns null when no positive, finite range exists, so callers can fall back to linear.
 */
export function logScaleAxis(min: number, max: number): LogAxis | null {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
  if (max < min) [min, max] = [max, min];
  if (max / min < 1.01) {
    min /= 1.05;
    max *= 1.05;
  }

  for (const mantissas of LOG_MANTISSAS) {
    const axis = snapToCandidates(min, max, logCandidates(min, max, mantissas));
    if (axis.ticks.length <= MAX_LOG_TICKS) return axis;
  }
  const decades = Math.ceil(Math.log10(max)) - Math.floor(Math.log10(min));
  const step = Math.ceil(decades / (MAX_LOG_TICKS - 1));
  return snapToCandidates(min, max, logCandidates(min, max, [1], step));
}

/** Rows that can be plotted on a log axis (positive, finite prices). */
export function logPlottableRows<T extends ChartRow>(rows: T[]): T[] {
  return rows.filter((r) => Number.isFinite(r.price) && r.price > 0);
}

export function formatLogAxisPrice(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 1 ? 3 : 2,
  });
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
