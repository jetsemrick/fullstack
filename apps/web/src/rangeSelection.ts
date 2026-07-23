/** Minimal chart row shape the range-selection logic operates on. */
export type RangeRow = { t: number; price: number };

export type RangeStatus = "positive" | "negative" | "muted";

export type RangeChange = {
  /** Timestamp (ms) of the first data point inside the window. */
  startMs: number;
  /** Timestamp (ms) of the last data point inside the window. */
  endMs: number;
  startPrice: number;
  endPrice: number;
  /** endPrice - startPrice. */
  diff: number;
  /** Percent change relative to startPrice. */
  pct: number;
  status: RangeStatus;
};

/**
 * Net price change for a drag selection bounded by two x-axis timestamps.
 *
 * Uses the FIRST and LAST close that fall inside the (inclusive) window
 * [min(a,b), max(a,b)], not the global series endpoints. This makes endpoints
 * snap to real data points, so series gaps resolve to the nearest available
 * point at each edge. Returns null for windows that would produce misleading
 * stats: missing bounds, zero width, or fewer than two points in range.
 */
export function computeRangeChange(
  rows: readonly RangeRow[],
  a: number | null | undefined,
  b: number | null | undefined,
): RangeChange | null {
  if (a == null || b == null) return null;
  if (a === b) return null;

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  const inWindow = rows.filter((r) => r.t >= lo && r.t <= hi);
  if (inWindow.length < 2) return null;

  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;

  const startPrice = first.price;
  const endPrice = last.price;
  const diff = endPrice - startPrice;
  const pct = startPrice !== 0 ? (diff / startPrice) * 100 : 0;

  const status: RangeStatus = diff > 0 ? "positive" : diff < 0 ? "negative" : "muted";

  return {
    startMs: first.t,
    endMs: last.t,
    startPrice,
    endPrice,
    diff,
    pct,
    status,
  };
}

/** Signed dollar amount, e.g. `+$1.23`, `-$0.48`, `$0.00`. */
export function formatSignedPrice(diff: number): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const abs = Math.abs(diff).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${abs}`;
}

/** Signed percent, e.g. `+16.29%`, `-0.16%`, `0.00%`. */
export function formatSignedPercent(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  const abs = Math.abs(pct).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${abs}%`;
}
