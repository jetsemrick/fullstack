export type RangeRow = {
  t: number;
  price: number;
};

export type RangeStatus = "positive" | "negative" | "muted";

export type RangeChange = {
  startMs: number;
  endMs: number;
  startPrice: number;
  endPrice: number;
  diff: number;
  pct: number;
  status: RangeStatus;
};

export function computeRangeChange(
  rows: readonly RangeRow[],
  a: number | null | undefined,
  b: number | null | undefined,
): RangeChange | null {
  if (a == null || b == null || a === b) return null;

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const inWindow = rows.filter((row) => row.t >= lo && row.t <= hi);
  if (inWindow.length < 2) return null;

  const first = inWindow[0]!;
  const last = inWindow[inWindow.length - 1]!;
  const diff = last.price - first.price;
  const pct = first.price === 0 ? 0 : (diff / first.price) * 100;

  return {
    startMs: first.t,
    endMs: last.t,
    startPrice: first.price,
    endPrice: last.price,
    diff,
    pct,
    status: diff > 0 ? "positive" : diff < 0 ? "negative" : "muted",
  };
}

export function formatSignedPrice(diff: number): string {
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const abs = Math.abs(diff).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${abs}`;
}

export function formatSignedPercent(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  const abs = Math.abs(pct).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${abs}%`;
}
