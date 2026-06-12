export type RangeRow = { t: number; price: number };

export type RangeChangeStatus = "positive" | "negative" | "muted";

export type RangeChange = {
  /** First in-window data point timestamp (ms) */
  startMs: number;
  /** Last in-window data point timestamp (ms) */
  endMs: number;
  startClose: number;
  endClose: number;
  /** endClose - startClose */
  diff: number;
  /** Percent change relative to startClose */
  pct: number;
  status: RangeChangeStatus;
};

/**
 * Net change between the first and last close *within* the selected window.
 * Endpoints (`a`, `b`) are data-point timestamps and may be passed in either
 * order, so a right-to-left drag normalizes to the same window. Returns null
 * when the window holds fewer than two points or has zero width, so callers
 * never show misleading stats for tiny or empty selections. Series gaps resolve
 * naturally to the nearest real points at each edge.
 */
export function computeRangeChange(
  rows: RangeRow[],
  a: number | null,
  b: number | null,
): RangeChange | null {
  if (a == null || b == null) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return null;
  const inWindow = rows.filter((r) => r.t >= lo && r.t <= hi);
  if (inWindow.length < 2) return null;
  const startClose = inWindow[0]!.price;
  const endClose = inWindow[inWindow.length - 1]!.price;
  if (!startClose) return null;
  const diff = endClose - startClose;
  const pct = (diff / startClose) * 100;
  const status: RangeChangeStatus = diff > 0 ? "positive" : diff < 0 ? "negative" : "muted";
  return {
    startMs: inWindow[0]!.t,
    endMs: inWindow[inWindow.length - 1]!.t,
    startClose,
    endClose,
    diff,
    pct,
    status,
  };
}

export function formatSignedPrice(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSignedPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
