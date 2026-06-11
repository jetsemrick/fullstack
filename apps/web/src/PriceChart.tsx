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
import { useEffect, useRef, useState } from "react";
import type { CategoricalChartState } from "recharts/types/chart/types";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";
import {
  computeRangeChange,
  formatSignedPercent,
  formatSignedPrice,
  type RangeRow,
} from "./rangeSelection";

const chartData = (data: GetPricesResponse): RangeRow[] =>
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

  // Mirror of the in-progress drag so a window-level mouseup (which fires even
  // when the pointer is released outside the plot area) can commit reliably.
  const dragRef = useRef<{ start: number | null; end: number | null; active: boolean }>({
    start: null,
    end: null,
    active: false,
  });
  // Last x-axis label the pointer resolved to, used as a fallback when a
  // mousedown/mouseup event lands without a fresh `activeLabel`.
  const hoverLabelRef = useRef<number | null>(null);

  function clearSelection() {
    dragRef.current = { start: null, end: null, active: false };
    setSelection(null);
    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
  }

  function syncSelectionFromDrag() {
    const { start, end } = dragRef.current;
    // A real drag (start !== end) yields a selection; a click (start === end) clears it.
    setSelection(start != null && end != null && start !== end ? { a: start, b: end } : null);
  }

  function finalizeDrag() {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    syncSelectionFromDrag();
  }

  // Escape clears the selection. Mouseup also finalizes as a backup, though the
  // primary finalize path is detecting button release in `onMouseMove` (below),
  // which is resilient to environments that don't deliver a mouseup to window.
  useEffect(() => {
    function onUp() {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      const { start, end } = dragRef.current;
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setSelection(start != null && end != null && start !== end ? { a: start, b: end } : null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dragRef.current = { start: null, end: null, active: false };
        setSelection(null);
        setDragStart(null);
        setDragEnd(null);
        setIsDragging(false);
      }
    }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const activeBounds = isDragging
    ? { a: dragStart, b: dragEnd }
    : selection
      ? { a: selection.a, b: selection.b }
      : { a: null, b: null };

  const stats = computeRangeChange(rows, activeBounds.a, activeBounds.b);

  function labelFromState(s: CategoricalChartState | null): number | null {
    // Recharts types `activeLabel` as string, but a numeric (time) axis yields a number at runtime.
    const v = s?.activeLabel as number | string | undefined;
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function leftButtonHeld(e: MouseEvent | undefined): boolean {
    return ((e?.buttons ?? 0) & 1) === 1;
  }

  function onMouseDown(s: CategoricalChartState | null) {
    const label = labelFromState(s) ?? hoverLabelRef.current;
    if (label == null) {
      clearSelection();
      return;
    }
    dragRef.current = { start: label, end: label, active: true };
    setIsDragging(true);
    setDragStart(label);
    setDragEnd(label);
    setSelection(null);
  }

  function onMouseMove(s: CategoricalChartState | null, e?: MouseEvent) {
    const label = labelFromState(s);
    if (label != null) hoverLabelRef.current = label;
    if (!dragRef.current.active) return;
    // Extend and commit the selection live so it persists even if a trailing
    // mouseup never reaches the page.
    if (label != null) {
      dragRef.current.end = label;
      setDragEnd(label);
      syncSelectionFromDrag();
    }
    // If the button is no longer held, the drag has ended — finalize (the
    // selection is already committed above). This covers environments that do
    // not deliver a mouseup to the window.
    if (!leftButtonHeld(e)) finalizeDrag();
  }

  function onMouseUp(s: CategoricalChartState | null) {
    const label = labelFromState(s) ?? hoverLabelRef.current;
    if (label != null && dragRef.current.active) {
      dragRef.current.end = label;
    }
    finalizeDrag();
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
          throttleDelay={0}
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
