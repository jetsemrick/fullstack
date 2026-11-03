import type { PriceEvents } from "@stock/shared";
import { EASTERN } from "./usMarket";

/** Markers closer than this on screen merge into one marker with a count. */
export const MARKER_MERGE_PX = 8;

export type ChartEvent = {
  kind: "dividend" | "split";
  /** Unix milliseconds */
  t: number;
  /** Visible tooltip text, e.g. "Split 4-for-1 · Aug 31, 2020" */
  label: string;
  ariaLabel: string;
};

export type MarkerGroup = {
  /** Pixel x of the group's first event */
  x: number;
  events: ChartEvent[];
  /** Groups that contain a split draw as a split so splits are never hidden behind dividends. */
  kind: "dividend" | "split";
};

/** Event dates are exchange dates, so format in New York time regardless of the viewer's zone. */
export function formatEventDate(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toLocaleDateString("en-US", {
    timeZone: EASTERN,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDividendAmount(amount: number, currency: string | null): string {
  try {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } catch {
    return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
}

function formatRatioPart(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** Builds chart events inside [startMs, endMs], sorted by time. */
export function visibleChartEvents(
  events: PriceEvents | undefined,
  [startMs, endMs]: [number, number],
  currency: string | null,
): ChartEvent[] {
  if (!events) return [];
  const out: ChartEvent[] = [];
  for (const d of events.dividends ?? []) {
    const t = d.timestamp * 1000;
    if (t < startMs || t > endMs) continue;
    const amount = formatDividendAmount(d.amount, currency);
    const date = formatEventDate(d.timestamp);
    out.push({ kind: "dividend", t, label: `Dividend ${amount} · ${date}`, ariaLabel: `Dividend, ${amount}, ${date}` });
  }
  for (const s of events.splits ?? []) {
    const t = s.timestamp * 1000;
    if (t < startMs || t > endMs) continue;
    const n = formatRatioPart(s.numerator);
    const d = formatRatioPart(s.denominator);
    const ratio = `${n}-for-${d}`;
    const date = formatEventDate(s.timestamp);
    out.push({ kind: "split", t, label: `Split ${ratio} · ${date}`, ariaLabel: `Split, ${ratio}, ${date}` });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Greedy left-to-right merge: an event joins the current group while within `thresholdPx` of the group's first event. */
export function mergeMarkers(
  events: ChartEvent[],
  xOf: (t: number) => number,
  thresholdPx = MARKER_MERGE_PX,
): MarkerGroup[] {
  const groups: MarkerGroup[] = [];
  for (const e of events) {
    const x = xOf(e.t);
    if (!Number.isFinite(x)) continue;
    const last = groups[groups.length - 1];
    if (last && x - last.x <= thresholdPx) {
      last.events.push(e);
      if (e.kind === "split") last.kind = "split";
    } else {
      groups.push({ x, events: [e], kind: e.kind });
    }
  }
  return groups;
}

export function groupAriaLabel(group: MarkerGroup): string {
  if (group.events.length === 1) return group.events[0]!.ariaLabel;
  return `${group.events.length} events: ${group.events.map((e) => e.ariaLabel).join("; ")}`;
}
