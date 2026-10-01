import type { GetPricesResponse, PricePoint } from "@stock/shared";

/** PricePoint.timestamp is Unix seconds (see packages/shared). */
const SECONDS_PER_DAY = 86_400;

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

export type OverlayChartRow = PriceVolumeRow & {
  sma50: number | null;
  sma200: number | null;
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

export function downsampleRows<T extends ChartRow>(rows: T[], maxRows: number): T[] {
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

/** Simple moving average; the first `window - 1` values (and any incomplete window) are null. */
export function simpleMovingAverage(values: readonly number[], window: number): Array<number | null> {
  if (!Number.isInteger(window) || window < 1) {
    return values.map(() => null);
  }
  return values.map((_, index) => {
    if (index < window - 1) return null;
    let sum = 0;
    for (let i = index - window + 1; i <= index; i++) {
      const value = values[i];
      if (value == null || !Number.isFinite(value)) return null;
      sum += value;
    }
    return sum / window;
  });
}

/** Attach volume helpers and 50/200-day SMAs computed on the full close series. */
export function buildOverlayRows(data: GetPricesResponse): OverlayChartRow[] {
  const rows = buildPriceVolumeRows(data);
  const closes = data.series.map((p) => p.close);
  const sma50 = simpleMovingAverage(closes, 50);
  const sma200 = simpleMovingAverage(closes, 200);
  return rows.map((row, i) => ({
    ...row,
    sma50: sma50[i] ?? null,
    sma200: sma200[i] ?? null,
  }));
}

/**
 * Yahoo coarsens `range=max` (often to quarterly), which is too sparse for 50/200-day
 * SMAs. 1Y/5Y request 10y daily; Today and All Time keep their declared ranges.
 */
export function dailyFetchRange(horizonDays: number, declaredRange: string): string {
  if (horizonDays <= 1) return declaredRange;
  if (Number.isFinite(horizonDays)) return "10y";
  return declaredRange;
}

/**
 * Keep bars whose Unix-second timestamp falls within `horizonDays` of the latest bar.
 * All Time (`Infinity`) is returned unchanged.
 */
export function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (!Number.isFinite(horizonDays)) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (latestTimestamp == null) return data;
  const cutoff = latestTimestamp - horizonDays * SECONDS_PER_DAY;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}
