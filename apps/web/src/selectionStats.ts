import type { PricePoint } from "@stock/shared";

/** Inclusive time window selected on the chart, expressed in epoch milliseconds. */
export interface SelectionRange {
  start: number;
  end: number;
}

export type SelectionDirection = "up" | "down" | "flat";

export interface SelectionStats {
  /** Timestamp (ms) of the first close inside the window. */
  startMs: number;
  /** Timestamp (ms) of the last close inside the window. */
  endMs: number;
  startClose: number;
  endClose: number;
  /** endClose - startClose. */
  absChange: number;
  /** Percent change vs the first close, or null when the first close is 0. */
  pctChange: number | null;
  /** Number of series points that fell inside the window. */
  pointCount: number;
  direction: SelectionDirection;
}

/** Minimum points required before a selection reports stats (guards misleading single-point brushes). */
export const MIN_SELECTION_POINTS = 2;

/**
 * Net change for the closes that fall inside `range`. Uses the first and last close within the
 * window (not the raw brush edges) so the result matches what a reader would tally by hand.
 * Returns null when there is no range or fewer than {@link MIN_SELECTION_POINTS} points.
 */
export function computeSelectionStats(
  series: Pick<PricePoint, "timestamp" | "close">[],
  range: SelectionRange | null,
): SelectionStats | null {
  if (!range) return null;
  const lo = Math.min(range.start, range.end);
  const hi = Math.max(range.start, range.end);

  const inWindow = series
    .map((p) => ({ ms: p.timestamp * 1000, close: p.close }))
    .filter((p) => p.ms >= lo && p.ms <= hi);

  if (inWindow.length < MIN_SELECTION_POINTS) return null;

  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const absChange = last.close - first.close;
  const pctChange = first.close !== 0 ? (absChange / first.close) * 100 : null;
  const direction: SelectionDirection = absChange > 0 ? "up" : absChange < 0 ? "down" : "flat";

  return {
    startMs: first.ms,
    endMs: last.ms,
    startClose: first.close,
    endClose: last.close,
    absChange,
    pctChange,
    pointCount: inWindow.length,
    direction,
  };
}
