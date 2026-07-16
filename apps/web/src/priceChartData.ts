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

export interface SelectionStats {
  dollarChange: number;
  percentChange: number;
  startPrice: number;
  endPrice: number;
  pointCount: number;
}

export function calculateSelectionStats(
  rows: ChartRow[],
  startX: number,
  endX: number,
  minPoints = 2,
): SelectionStats | null {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const selectedPoints = rows.filter((row) => row.t >= minX && row.t <= maxX);
  if (selectedPoints.length < minPoints) return null;

  const startPrice = selectedPoints[0]!.price;
  const endPrice = selectedPoints[selectedPoints.length - 1]!.price;
  if (startPrice === 0) return null;
  const dollarChange = endPrice - startPrice;

  return {
    dollarChange,
    percentChange: (dollarChange / startPrice) * 100,
    startPrice,
    endPrice,
    pointCount: selectedPoints.length,
  };
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
