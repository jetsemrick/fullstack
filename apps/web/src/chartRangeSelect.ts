import type { ChartRow } from "./priceChartData";

export type RangeNetChange = {
  abs: number;
  pct: number;
  pointCount: number;
  startT: number;
  endT: number;
};

/** Inclusive time window; order of t0/t1 does not matter. */
export function rowsInTimeRange(rows: ChartRow[], t0: number, t1: number): ChartRow[] {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return rows.filter((r) => r.t >= lo && r.t <= hi);
}

/**
 * Net change from first to last close in a time window.
 * Returns null when fewer than two points would make a percent change misleading.
 */
export function netChangeForWindow(
  rows: ChartRow[],
  t0: number,
  t1: number,
  minPoints = 2,
): RangeNetChange | null {
  const sliced = rowsInTimeRange(rows, t0, t1);
  if (sliced.length < minPoints) return null;
  const first = sliced[0]!.price;
  const last = sliced[sliced.length - 1]!.price;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  const abs = last - first;
  const pct = (abs / first) * 100;
  return {
    abs,
    pct,
    pointCount: sliced.length,
    startT: sliced[0]!.t,
    endT: sliced[sliced.length - 1]!.t,
  };
}

export function formatSignedMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSignedPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function rangeChangeStatusClass(pct: number): "positive" | "negative" | "muted" {
  if (pct > 0) return "positive";
  if (pct < 0) return "negative";
  return "muted";
}
