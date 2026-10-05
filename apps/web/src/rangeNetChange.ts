import type { ChartRow } from "./priceChartData";

export type RangeNetChangeResult = { dollar: number; percent: number };

export type RangeBadgeStatus = "positive" | "negative" | "muted";

export function rangeNetChange(
  rows: ChartRow[],
  startMs: number,
  endMs: number,
): RangeNetChangeResult | null {
  const lo = Math.min(startMs, endMs);
  const hi = Math.max(startMs, endMs);

  let first: ChartRow | null = null;
  let last: ChartRow | null = null;

  for (const row of rows) {
    if (row.t < lo || row.t > hi) continue;
    if (!Number.isFinite(row.price)) continue;
    if (!first) first = row;
    last = row;
  }

  if (!first || !last || first === last) return null;
  if (first.price === 0) return null;

  const dollar = last.price - first.price;
  const percent = (dollar / first.price) * 100;
  return { dollar, percent };
}

function formatSignedMoney(dollar: number): string {
  const abs = Math.abs(dollar).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (dollar > 0) return `+$${abs}`;
  if (dollar < 0) return `-$${abs}`;
  return `$${abs}`;
}

function formatSignedPercent(percent: number): string {
  const formatted = Math.abs(percent).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (percent > 0) return `+${formatted}%`;
  if (percent < 0) return `-${formatted}%`;
  return `${formatted}%`;
}

export function formatRangeBadge(
  dollar: number,
  percent: number,
): { text: string; status: RangeBadgeStatus } {
  let status: RangeBadgeStatus;
  if (dollar > 0) status = "positive";
  else if (dollar < 0) status = "negative";
  else status = "muted";

  const text = `${formatSignedMoney(dollar)} (${formatSignedPercent(percent)})`;
  return { text, status };
}
