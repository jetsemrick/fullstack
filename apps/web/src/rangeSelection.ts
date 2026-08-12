import type { ChartRow } from "./priceChartData";

export type RangeDirection = "up" | "down" | "flat";

export type RangeStats = {
  startT: number;
  endT: number;
  startPrice: number;
  endPrice: number;
  absChange: number;
  pctChange: number;
  direction: RangeDirection;
  pointCount: number;
};

/** Minimum data points inside a selection before stats are considered meaningful. */
export const MIN_SELECTION_POINTS = 2;

/** Rows whose timestamp falls within the inclusive window bounded by `a` and `b` (order-agnostic). */
export function rowsInWindow(rows: ChartRow[], a: number, b: number): ChartRow[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return rows.filter((r) => r.t >= lo && r.t <= hi);
}

/**
 * Net change stats for a drag selection.
 *
 * Uses the first and last close inside the window. Returns null when the
 * selection is missing or too short to avoid showing misleading numbers.
 * `rows` is assumed to be sorted ascending by `t` (as produced by the chart).
 */
export function computeRangeStats(
  rows: ChartRow[],
  a: number | null,
  b: number | null,
): RangeStats | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;

  const within = rowsInWindow(rows, a, b);
  if (within.length < MIN_SELECTION_POINTS) return null;

  const start = within[0]!;
  const end = within[within.length - 1]!;
  const absChange = end.price - start.price;
  const pctChange = start.price !== 0 ? (absChange / start.price) * 100 : 0;
  const direction: RangeDirection = absChange > 0 ? "up" : absChange < 0 ? "down" : "flat";

  return {
    startT: start.t,
    endT: end.t,
    startPrice: start.price,
    endPrice: end.price,
    absChange,
    pctChange,
    direction,
    pointCount: within.length,
  };
}

export function formatSignedPrice(n: number, currency?: string | null): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cur = currency ? ` ${currency}` : "";
  return `${sign}${abs}${cur}`;
}

export function formatSignedPercent(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${abs}%`;
}
