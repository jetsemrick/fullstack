export type ChartRow = { t: number; price: number };

export type SelectionRange = { startMs: number; endMs: number };

export type RangeNetChange = {
  startPrice: number;
  endPrice: number;
  dollarChange: number;
  percentChange: number;
  pointCount: number;
};

export function normalizeSelectionRange(startMs: number, endMs: number): SelectionRange {
  return { startMs: Math.min(startMs, endMs), endMs: Math.max(startMs, endMs) };
}

export function pointsInRange(rows: ChartRow[], range: SelectionRange): ChartRow[] {
  return rows.filter((p) => p.t >= range.startMs && p.t <= range.endMs);
}

/** Net change from first to last close within the selected time window. */
export function computeRangeNetChange(rows: ChartRow[], range: SelectionRange): RangeNetChange | null {
  const points = pointsInRange(rows, range);
  if (points.length < 2) return null;

  const startPrice = points[0]!.price;
  const endPrice = points[points.length - 1]!.price;
  if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || startPrice === 0) return null;

  const dollarChange = endPrice - startPrice;
  const percentChange = (dollarChange / startPrice) * 100;

  return {
    startPrice,
    endPrice,
    dollarChange,
    percentChange,
    pointCount: points.length,
  };
}

export function formatDollarChange(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercentFromChange(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function changeStatus(dollarChange: number): "positive" | "negative" | "muted" {
  if (dollarChange > 0) return "positive";
  if (dollarChange < 0) return "negative";
  return "muted";
}

export function chartEventToTimestamp(state: {
  xValue?: number;
  activeLabel?: string;
} | null): number | null {
  if (!state) return null;
  if (typeof state.xValue === "number" && Number.isFinite(state.xValue)) return state.xValue;
  if (state.activeLabel != null) {
    const parsed = Number(state.activeLabel);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
