import type { GetPricesResponse } from "@stock/shared";

export type ColoredChartRow = {
  t: number;
  price: number;
  /** Price clamped to open for green area (above open shows real price, below clamps to open) */
  priceAbove: number;
  /** Price clamped to open for red area (below open shows real price, above clamps to open) */
  priceBelow: number;
};

/**
 * Determines the open price for chart coloring.
 * Uses response.openPrice if available, otherwise falls back to the first point's close.
 */
export function getOpenPrice(data: GetPricesResponse): number | null {
  if (data.openPrice != null) {
    return data.openPrice;
  }
  if (data.series.length > 0) {
    const firstOpen = data.series[0].open;
    if (firstOpen != null) {
      return firstOpen;
    }
    return data.series[0].close;
  }
  return null;
}

/**
 * Transforms chart data into colored rows with crossing-point interpolation.
 * Uses clamping approach: priceAbove clamps to open when below, priceBelow clamps to open when above.
 * This ensures continuous areas that fill correctly relative to the open price baseline.
 */
export function computeOpenPriceColoring(
  rows: { t: number; price: number }[],
  openPrice: number
): ColoredChartRow[] {
  if (rows.length === 0) return [];

  const result: ColoredChartRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const curr = rows[i];
    const prev = i > 0 ? rows[i - 1] : null;

    if (prev) {
      const prevAbove = prev.price >= openPrice;
      const currAbove = curr.price >= openPrice;

      if (prevAbove !== currAbove && prev.price !== openPrice && curr.price !== openPrice) {
        const ratio = (openPrice - prev.price) / (curr.price - prev.price);
        const crossT = prev.t + ratio * (curr.t - prev.t);
        result.push({
          t: crossT,
          price: openPrice,
          priceAbove: openPrice,
          priceBelow: openPrice,
        });
      }
    }

    const isAbove = curr.price >= openPrice;
    result.push({
      t: curr.t,
      price: curr.price,
      priceAbove: isAbove ? curr.price : openPrice,
      priceBelow: isAbove ? openPrice : curr.price,
    });
  }

  return result;
}

/**
 * Determines the stroke color based on whether current price is above or below open.
 * Returns green for above, red for below.
 */
export function getOverallTrend(
  rows: { price: number }[],
  openPrice: number
): "positive" | "negative" | "neutral" {
  if (rows.length === 0) return "neutral";
  const lastPrice = rows[rows.length - 1].price;
  if (lastPrice > openPrice) return "positive";
  if (lastPrice < openPrice) return "negative";
  return "neutral";
}
