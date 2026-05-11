import type { GetPricesResponse, PricePoint } from "@stock/shared";

export type PriceVolumeRow = {
  t: number;
  price: number;
  openPrice: number | null;
  priceAboveOpen: number | null;
  priceBelowOpen: number | null;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export function seriesHasVolume(series: PricePoint[]): boolean {
  return series.some((p) => p.volume != null);
}

export function buildPriceVolumeRows(data: GetPricesResponse): PriceVolumeRow[] {
  const openPrice = resolveOpenPrice(data);
  if (openPrice == null) {
    return data.series.map((p) => ({
      t: p.timestamp * 1000,
      price: p.close,
      openPrice: null,
      priceAboveOpen: p.close,
      priceBelowOpen: null,
      volume: p.volume,
      volumeBar: p.volume ?? 0,
    }));
  }

  const rows: PriceVolumeRow[] = [];
  for (const p of data.series) {
    const row = createRow(p.timestamp * 1000, p.close, openPrice, p.volume);
    const previous = rows[rows.length - 1];
    if (previous && crossesOpen(previous.price, row.price, openPrice)) {
      rows.push(createIntersectionRow(previous, row, openPrice));
    }
    rows.push(row);
  }
  return rows;
}

/** Prefer upstream open data, then fall back to the first displayed close. */
export function resolveOpenPrice(data: GetPricesResponse): number | null {
  const first = data.series[0];
  const upstreamOpen = first?.open ?? data.openPrice;
  if (typeof upstreamOpen === "number" && Number.isFinite(upstreamOpen)) return upstreamOpen;
  if (typeof first?.close === "number" && Number.isFinite(first.close)) return first.close;
  return null;
}

function createRow(t: number, price: number, openPrice: number, volume: number | null): PriceVolumeRow {
  return {
    t,
    price,
    openPrice,
    priceAboveOpen: price >= openPrice ? price : null,
    priceBelowOpen: price <= openPrice ? price : null,
    volume,
    volumeBar: volume ?? 0,
  };
}

function crossesOpen(previousPrice: number, nextPrice: number, openPrice: number): boolean {
  return (previousPrice < openPrice && nextPrice > openPrice) || (previousPrice > openPrice && nextPrice < openPrice);
}

function createIntersectionRow(previous: PriceVolumeRow, next: PriceVolumeRow, openPrice: number): PriceVolumeRow {
  const priceDelta = next.price - previous.price;
  const ratio = priceDelta === 0 ? 0 : (openPrice - previous.price) / priceDelta;
  const t = previous.t + (next.t - previous.t) * ratio;
  return {
    t,
    price: openPrice,
    openPrice,
    priceAboveOpen: openPrice,
    priceBelowOpen: openPrice,
    volume: null,
    volumeBar: 0,
  };
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
