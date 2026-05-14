import type { GetPricesResponse, PricePoint } from "@stock/shared";

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export type CompareChartSeriesInput = {
  id: string;
  ticker: string;
  color: string;
  data: GetPricesResponse;
};

export type CompareChartSeriesMeta = {
  id: string;
  ticker: string;
  color: string;
  currency: string | null;
  firstClose: number;
};

export type CompareChartRow = {
  t: number;
  [key: string]: number;
};

export function compareValueKey(id: string): string {
  return `${id}Value`;
}

export function compareCloseKey(id: string): string {
  return `${id}Close`;
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

export function buildCompareChartRows(
  series: CompareChartSeriesInput[],
  options: { normalizeToFirstClose: boolean },
): { rows: CompareChartRow[]; series: CompareChartSeriesMeta[] } {
  const rowsByTimestamp = new Map<number, CompareChartRow>();
  const usableSeries: CompareChartSeriesMeta[] = [];

  for (const item of series) {
    const points = item.data.series.filter((point) => Number.isFinite(point.close));
    const firstPoint = points.find((point) => point.close > 0);
    if (!firstPoint) continue;

    usableSeries.push({
      id: item.id,
      ticker: item.ticker,
      color: item.color,
      currency: item.data.currency,
      firstClose: firstPoint.close,
    });

    for (const point of points) {
      const t = point.timestamp * 1000;
      const row = rowsByTimestamp.get(t) ?? { t };
      row[compareCloseKey(item.id)] = point.close;
      row[compareValueKey(item.id)] = options.normalizeToFirstClose
        ? (point.close / firstPoint.close) * 100
        : point.close;
      rowsByTimestamp.set(t, row);
    }
  }

  return {
    rows: Array.from(rowsByTimestamp.values()).sort((a, b) => a.t - b.t),
    series: usableSeries,
  };
}
