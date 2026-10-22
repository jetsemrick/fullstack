import type { PricePoint } from "@stock/shared";

export type RangeNetChange = {
  startClose: number;
  endClose: number;
  dollar: number;
  percent: number | null;
};

export type RangeChangeTone = "positive" | "negative" | "muted";

export function rangeNetChange(
  series: PricePoint[],
  startMs: number,
  endMs: number,
): RangeNetChange | null {
  const lo = Math.min(startMs, endMs);
  const hi = Math.max(startMs, endMs);

  const inWindow = series
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => {
      const t = p.timestamp * 1000;
      return t >= lo && t <= hi;
    })
    .sort((a, b) => a.p.timestamp - b.p.timestamp || a.index - b.index);

  if (inWindow.length < 2) return null;

  const startClose = inWindow[0]!.p.close;
  const endClose = inWindow[inWindow.length - 1]!.p.close;
  const dollar = endClose - startClose;
  const percent = startClose === 0 ? null : (dollar / startClose) * 100;

  return { startClose, endClose, dollar, percent };
}

export function rangeChangeTone(change: RangeNetChange): RangeChangeTone {
  const value = change.percent ?? change.dollar;
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "muted";
}

function signedFixed(n: number, suffix: string): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${abs}${suffix}`;
}

/** e.g. "+3.21 USD (+1.52%)"; percent is omitted when it cannot be computed. */
export function formatRangeNetChange(change: RangeNetChange, currency: string | null): string {
  const dollar = signedFixed(change.dollar, currency ? ` ${currency}` : "");
  if (change.percent == null) return dollar;
  return `${dollar} (${signedFixed(change.percent, "%")})`;
}
