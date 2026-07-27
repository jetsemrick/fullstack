import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";
import {
  computeRangeChange,
  formatSignedPercent,
  formatSignedPrice,
  type RangeRow,
} from "./rangeSelection";

const MAX_DAILY_RENDER_POINTS = 1_200;

/** Minimal shape of the Recharts mouse-event state we rely on. */
type ChartMouseState = { activeLabel?: string | number } | null;

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
  const fillGradientId = useId().replace(/:/g, "");
  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const spanDays = spanCalendarDays(rows);
  const tickFormatter =
    variant === "intraday"
      ? (ms: number) => formatIntradayAxisTick(ms)
      : (ms: number) => formatDailyAxisTick(ms, spanDays);

  const sessionLayout = useMemo(() => {
    if (variant !== "intraday" || anchorMs <= 0) return undefined;
    return intradaySessionLayoutUtcMs(anchorMs);
  }, [variant, anchorMs]);

  const intradayTicks = useMemo(() => {
    if (!sessionLayout) return undefined;
    return hourlySessionTicksUtcMs(sessionLayout.rth[0], sessionLayout.rth[1]);
  }, [sessionLayout]);

  const xDomain = useMemo((): [number, number] | [string, string] => {
    if (variant === "intraday" && sessionLayout && rows.length > 0) {
      const dataStart = rows[0].t;
      const dataEnd = rows[rows.length - 1].t;
      // Anchor left to first bar so pre-market domain padding does not leave empty chart space.
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  // Drag-to-select range. `dragStart`/`dragEnd` track the live drag as x-axis
  // timestamps; `selection` holds the committed window. The parent passes a
  // `key` that remounts this component on ticker/horizon change, so all of this
  // local state resets automatically in those cases.
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ a: number; b: number } | null>(null);
  const isDragging = dragStart != null;

  // Mirror of the live drag so a window-level mouseup (which also fires when the
  // pointer is released outside the plot area) commits the correct window.
  const dragRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });

  // Most recent hovered x-axis label. Recharts sometimes dispatches the initial
  // `onMouseDown` before it has computed an active tooltip index (notably on the
  // intraday chart, whose data is clustered into a fixed session domain), so the
  // mousedown state can arrive without an `activeLabel`. Tracking the last
  // hovered label lets the drag start from the correct point in that case.
  const hoverRef = useRef<number | null>(null);

  // When mousedown has no label yet (common on intraday cold press), arm the
  // drag and seed start/end from the first mousemove that reports a label.
  const pendingDragRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearAll = useCallback(() => {
    pendingDragRef.current = false;
    hoverRef.current = null;
    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(null);
  }, []);

  const labelFromState = useCallback((s: ChartMouseState): number | null => {
    const v = s?.activeLabel;
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }, []);

  const onMouseDown = useCallback(
    (s: ChartMouseState) => {
      const label = labelFromState(s) ?? hoverRef.current;
      if (label == null) {
        // No known x yet: clear any committed selection and wait for the first
        // labeled mousemove (or mouseup, which abandons the pending drag).
        pendingDragRef.current = true;
        dragRef.current = { start: null, end: null };
        setDragStart(null);
        setDragEnd(null);
        setSelection(null);
        return;
      }
      pendingDragRef.current = false;
      dragRef.current = { start: label, end: label };
      setDragStart(label);
      setDragEnd(label);
      setSelection(null);
    },
    [labelFromState],
  );

  const onMouseMove = useCallback(
    (s: ChartMouseState) => {
      const label = labelFromState(s);
      if (label != null) hoverRef.current = label;

      if (pendingDragRef.current && label != null && dragRef.current.start == null) {
        pendingDragRef.current = false;
        dragRef.current = { start: label, end: label };
        setDragStart(label);
        setDragEnd(label);
        return;
      }

      if (dragRef.current.start == null) return;
      if (label != null) {
        dragRef.current.end = label;
        setDragEnd(label);
      }
    },
    [labelFromState],
  );

  const finalizeDrag = useCallback(() => {
    pendingDragRef.current = false;
    const { start, end } = dragRef.current;
    if (start == null) return;
    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(end != null && start !== end ? { a: start, b: end } : null);
  }, []);

  // Escape clears the selection; a window-level mouseup finalizes the drag even
  // when the pointer is released outside the plot area. Mousedown outside the
  // chart root clears a committed selection. Keyboard fallback: Escape.
  useEffect(() => {
    function onUp() {
      finalizeDrag();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clearAll();
    }
    function onDocMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root || root.contains(e.target as Node)) return;
      clearAll();
    }
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [finalizeDrag, clearAll]);

  const bounds = isDragging
    ? { a: dragStart, b: dragEnd }
    : selection
      ? { a: selection.a, b: selection.b }
      : { a: null, b: null };

  // Prefer full series for stats so daily downsample does not skew net change.
  // Band only when stats exist (≥2 points in window); never highlight without a readout.
  const stats = computeRangeChange(fullRows, bounds.a, bounds.b);
  const showBand = stats != null;

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={rootRef}
      onMouseLeave={() => {
        hoverRef.current = null;
      }}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        userSelect: isDragging ? "none" : undefined,
      }}
    >
      {stats && (
        <div className="chart-selection-stats" role="status" aria-live="polite">
          <span className="chart-selection-stats__range">
            {formatTooltipWhen(stats.startMs, variant, spanDays)} &rarr; {formatTooltipWhen(stats.endMs, variant, spanDays)}
          </span>
          <span className={`metric-badge ${stats.status}`}>
            {formatSignedPrice(stats.diff)} ({formatSignedPercent(stats.pct)})
          </span>
        </div>
      )}
      <div
        role="img"
        aria-label="Price over time line chart. Drag horizontally to select a range and see its net change. Press Escape to clear the selection."
        style={{ width: "100%", height: "100%" }}
      >
        <ResponsiveContainer width="100%" height="100%" minHeight={320}>
          <ComposedChart
            data={rows}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={finalizeDrag}
          >
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
            {variant === "intraday" && sessionLayout ? (
              <>
                <ReferenceArea
                  x1={sessionLayout.preMarket[0]}
                  x2={sessionLayout.preMarket[1]}
                  fill="var(--fg-muted)"
                  fillOpacity={0.08}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                />
                <ReferenceArea
                  x1={sessionLayout.afterHours[0]}
                  x2={sessionLayout.afterHours[1]}
                  fill="var(--fg-muted)"
                  fillOpacity={0.08}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                />
              </>
            ) : null}
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
                x1={Math.min(bounds.a!, bounds.b!)}
                x2={Math.max(bounds.a!, bounds.b!)}
                fill="var(--accent)"
                fillOpacity={0.12}
                stroke="var(--accent)"
                strokeOpacity={0.4}
                ifOverflow="visible"
              />
            )}
            <Area
              type="linear"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={3}
              fill={`url(#${fillGradientId})`}
              baseValue="dataMin"
              dot={false}
              activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: "var(--accent)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
