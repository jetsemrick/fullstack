import type { ChartRow } from "./priceChartData";

export type RangeDirection = "up" | "down" | "flat";

export type RangeStats = {
  startMs: number;
  endMs: number;
  startPrice: number;
  endPrice: number;
  change: number;
  /** Null when the first close is 0 and a percent change cannot be expressed. */
  percentChange: number | null;
  pointCount: number;
  direction: RangeDirection;
};

/** Below this, a "range" is a single close and any net change would be an artifact of the click. */
export const MIN_SELECTION_POINTS = 2;

/**
 * Net change between the first and last close inside [a, b]. Bounds may arrive in either
 * order because the drag can go right-to-left.
 */
export function computeRangeStats(rows: ChartRow[], a: number, b: number): RangeStats | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  const within = rows.filter((r) => r.t >= lower && r.t <= upper);
  if (within.length < MIN_SELECTION_POINTS) return null;

  const first = within[0]!;
  const last = within[within.length - 1]!;
  // Compare at display precision so a sub-cent drift does not render as a signed, colored change.
  const change = Math.round((last.price - first.price) * 100) / 100;

  return {
    startMs: first.t,
    endMs: last.t,
    startPrice: first.price,
    endPrice: last.price,
    change,
    // Derive percent from the cent-rounded change so flat windows stay unsigned at 0%.
    percentChange: first.price === 0 ? null : (change / first.price) * 100,
    pointCount: within.length,
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}

function formatAmount(n: number): string {
  return Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signFor(n: number): string {
  if (n > 0) return "+";
  if (n < 0) return "-";
  return "";
}

export function formatSignedPrice(change: number, currency: string | null): string {
  const suffix = currency ? ` ${currency}` : "";
  return `${signFor(change)}${formatAmount(change)}${suffix}`;
}

export function formatSignedPercent(percentChange: number | null): string {
  if (percentChange == null || !Number.isFinite(percentChange)) return "—";
  const rounded = Math.round(percentChange * 100) / 100;
  return `${signFor(rounded)}${formatAmount(rounded)}%`;
}

export function formatRangeWindow(startMs: number, endMs: number, variant: "daily" | "intraday"): string {
  const opts: Intl.DateTimeFormatOptions =
    variant === "intraday"
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" };
  const start = new Date(startMs).toLocaleString(undefined, opts);
  const end = new Date(endMs).toLocaleString(undefined, opts);
  return `${start} – ${end}`;
}
