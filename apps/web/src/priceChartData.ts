import type { GetPricesResponse, PricePoint, ReturnMode } from "@stock/shared";

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

export const RETURN_MODE_LABEL: Record<ReturnMode, string> = {
  price: "Price",
  total: "Total return",
};

export function seriesHasAdjClose(series: PricePoint[]): boolean {
  return series.some((p) => p.adjClose != null);
}

/**
 * Points plotted for a mode. Total return uses dividend-adjusted closes and drops bars without one,
 * so a series never mixes adjusted and unadjusted values.
 */
export function modeSeries(series: PricePoint[], mode: ReturnMode): { timestamp: number; value: number }[] {
  if (mode === "price") return series.map((p) => ({ timestamp: p.timestamp, value: p.close }));
  const out: { timestamp: number; value: number }[] = [];
  for (const p of series) {
    if (p.adjClose != null) out.push({ timestamp: p.timestamp, value: p.adjClose });
  }
  return out;
}

export function buildChartRows(data: GetPricesResponse, mode: ReturnMode): ChartRow[] {
  return modeSeries(data.series, mode).map((p) => ({ t: p.timestamp * 1000, price: p.value }));
}

/** Percent change from the first to the last plotted point, or null when it can't be computed. */
export function percentChange(series: PricePoint[], mode: ReturnMode): number | null {
  const points = modeSeries(series, mode);
  if (points.length < 2) return null;
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  if (!first) return null;
  return ((last - first) / first) * 100;
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
