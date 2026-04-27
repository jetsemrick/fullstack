import type { GetPricesResponse, PricePoint } from "@stock/shared";

export interface PriceChartRow {
  t: number;
  price: number;
  volume: number | null;
}

export function seriesHasVolume(series: PricePoint[]): boolean {
  return series.some((p) => p.volume != null);
}

export function buildPriceChartRows(data: GetPricesResponse): PriceChartRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    volume: p.volume,
  }));
}
