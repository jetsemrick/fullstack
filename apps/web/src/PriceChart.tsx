import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import type { CategoricalChartState } from "recharts/types/chart/types";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

type Row = { t: number; price: number };

const chartData = (data: GetPricesResponse): Row[] =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

function spanCalendarDays(rows: { t: number }[]): number {
  if (rows.length < 2) return 0;
  return (rows[rows.length - 1].t - rows[0].t) / 86_400_000;
}

/** X-axis labels for daily series: format depends on chart span so ticks read as calendar milestones. */
function formatDailyAxisTick(ms: number, spanDays: number): string {
  const d = new Date(ms);
  if (spanDays > 365 * 5) {
    return d.toLocaleDateString(undefined, { year: "numeric" });
  }
  if (spanDays > 120) {
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatIntradayAxisTick(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatTooltipWhen(
  ms: number,
  variant: "daily" | "intraday",
  spanDays: number,
): string {
  const d = new Date(ms);
  if (variant === "intraday") {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  if (spanDays > 365 * 5) {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type SelectionStats = {
  startMs: number;
  endMs: number;
  startClose: number;
  endClose: number;
  diff: number;
  pct: number;
  status: "positive" | "negative" | "muted";
};

/**
 * Net change between the first and last close *within* the selected window.
 * Endpoints snap to actual data points (Recharts `activeLabel`), so series gaps
 * resolve to the nearest real points at each edge. Returns null when the window
 * holds fewer than two points (avoids misleading stats on zero/tiny selections).
 */
function computeSelection(rows: Row[], a: number | null, b: number | null): SelectionStats | null {
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
  const status = diff > 0 ? "positive" : diff < 0 ? "negative" : "muted";
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

function formatSignedPrice(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${formatPrice(Math.abs(n))}`;
}

function formatSignedPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export type PriceChartVariant = "daily" | "intraday";

export function PriceChart({ data, variant = "daily" }: { data: GetPricesResponse; variant?: PriceChartVariant }) {
  const rows = chartData(data);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const spanDays = spanCalendarDays(rows);
  const tickFormatter =
    variant === "intraday"
      ? (ms: number) => formatIntradayAxisTick(ms)
      : (ms: number) => formatDailyAxisTick(ms, spanDays);

  // Derived values are auto-memoized by the React Compiler (enabled in this repo).
  const intradayDomain =
    variant === "intraday" && anchorMs > 0 ? regularSessionDomainUtcMs(anchorMs) : undefined;

  const intradayTicks = intradayDomain
    ? hourlySessionTicksUtcMs(intradayDomain[0], intradayDomain[1])
    : undefined;

  const xDomain: [number, number] | [string, string] =
    variant === "intraday" && intradayDomain ? intradayDomain : ["dataMin", "dataMax"];

  // Drag-to-select range state (in-progress edges snap to data point timestamps).
  // Selection itself is reset across ticker/horizon switches via a `key` on this
  // component in the parent, which remounts and clears all local state.
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ a: number; b: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function clearSelection() {
    setSelection(null);
    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
  }

  // Escape clears any active or in-progress selection. State setters are stable,
  // so the listener subscribes once.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelection(null);
        setDragStart(null);
        setDragEnd(null);
        setIsDragging(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeBounds = isDragging
    ? { a: dragStart, b: dragEnd }
    : selection
      ? { a: selection.a, b: selection.b }
      : { a: null, b: null };

  const stats = computeSelection(rows, activeBounds.a, activeBounds.b);

  function labelFromState(s: CategoricalChartState | null): number | null {
    // Recharts types `activeLabel` as string, but a numeric (time) axis yields a number at runtime.
    const v = s?.activeLabel as number | string | undefined;
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function onMouseDown(s: CategoricalChartState | null) {
    const label = labelFromState(s);
    if (label == null) {
      clearSelection();
      return;
    }
    setIsDragging(true);
    setDragStart(label);
    setDragEnd(label);
  }

  function onMouseMove(s: CategoricalChartState | null) {
    if (!isDragging) return;
    const label = labelFromState(s);
    if (label != null) setDragEnd(label);
  }

  function onMouseUp() {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragStart != null && dragEnd != null && dragStart !== dragEnd) {
      setSelection({ a: dragStart, b: dragEnd });
    } else {
      // A plain click (no drag) clears any existing selection.
      setSelection(null);
    }
    setDragStart(null);
    setDragEnd(null);
  }

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const showBand = activeBounds.a != null && activeBounds.b != null && activeBounds.a !== activeBounds.b;

  return (
    <div
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a range and see net change."
      style={{ width: "100%", height: "100%", position: "relative", userSelect: isDragging ? "none" : undefined }}
    >
      {stats && (
        <div className="chart-selection-stats" role="status" aria-live="polite">
          <span className="chart-selection-stats__range">
            {formatTooltipWhen(stats.startMs, variant, spanDays)} → {formatTooltipWhen(stats.endMs, variant, spanDays)}
          </span>
          <span className={`metric-badge ${stats.status}`}>
            {formatSignedPrice(stats.diff)} ({formatSignedPercent(stats.pct)})
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={xDomain}
            scale="time"
            ticks={variant === "intraday" ? intradayTicks : undefined}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            minTickGap={variant === "intraday" ? 0 : 32}
            dy={10}
          />
          <YAxis
            dataKey="price"
            domain={["auto", "auto"]}
            width={60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatPrice(v)}
            dx={-10}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: `1px solid var(--card-border)`,
              borderRadius: "12px",
              color: "var(--fg)",
              boxShadow: "var(--shadow)",
              padding: "12px",
            }}
            labelFormatter={(_, payload) => {
              const t = (payload?.[0]?.payload as { t?: number })?.t;
              if (typeof t === "number") {
                return formatTooltipWhen(t, variant, spanDays);
              }
              return "";
            }}
            formatter={(value: number | string) => [typeof value === "number" ? formatPrice(value) : value, "Close"]}
          />
          {showBand && (
            <ReferenceArea
              x1={Math.min(activeBounds.a!, activeBounds.b!)}
              x2={Math.max(activeBounds.a!, activeBounds.b!)}
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeOpacity={0.4}
              ifOverflow="visible"
            />
          )}
          <Line
            type="linear"
            dataKey="price"
            stroke="var(--accent)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: "var(--accent)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
