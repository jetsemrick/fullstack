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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";
import {
  computeRangeChange,
  formatSignedPercent,
  formatSignedPrice,
  type RangeRow,
} from "./rangeSelection";

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
  const rows = useMemo(() => chartData(data), [data]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const spanDays = spanCalendarDays(rows);
  const tickFormatter =
    variant === "intraday"
      ? (ms: number) => formatIntradayAxisTick(ms)
      : (ms: number) => formatDailyAxisTick(ms, spanDays);

  const intradayDomain = useMemo(() => {
    if (variant !== "intraday" || anchorMs <= 0) return undefined;
    return regularSessionDomainUtcMs(anchorMs);
  }, [variant, anchorMs]);

  const intradayTicks = useMemo(() => {
    if (!intradayDomain) return undefined;
    return hourlySessionTicksUtcMs(intradayDomain[0], intradayDomain[1]);
  }, [intradayDomain]);

  const xDomain = useMemo((): [number, number] | [string, string] => {
    if (variant === "intraday" && intradayDomain) return intradayDomain;
    return ["dataMin", "dataMax"];
  }, [variant, intradayDomain]);

  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ a: number; b: number } | null>(null);
  const isDragging = dragStart != null;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
  const hoverRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(null);
  }, []);

  const labelFromState = useCallback((state: ChartMouseState): number | null => {
    const value = state?.activeLabel;
    if (value == null) return null;
    const label = typeof value === "number" ? value : Number(value);
    return Number.isFinite(label) ? label : null;
  }, []);

  const handleMouseDown = useCallback(
    (state: ChartMouseState) => {
      const label = labelFromState(state) ?? hoverRef.current;
      if (label == null) {
        clearSelection();
        return;
      }
      dragRef.current = { start: label, end: label };
      setDragStart(label);
      setDragEnd(label);
      setSelection(null);
    },
    [clearSelection, labelFromState],
  );

  const handleMouseMove = useCallback(
    (state: ChartMouseState) => {
      const label = labelFromState(state);
      if (label != null) hoverRef.current = label;
      if (dragRef.current.start == null || label == null) return;
      dragRef.current.end = label;
      setDragEnd(label);
    },
    [labelFromState],
  );

  const finalizeDrag = useCallback(() => {
    const { start, end } = dragRef.current;
    if (start == null) return;
    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(end != null && start !== end ? { a: start, b: end } : null);
  }, []);

  useEffect(() => {
    function onMouseUp() {
      finalizeDrag();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }

    function onMouseDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current && !wrapperRef.current.contains(target)) {
        clearSelection();
      }
    }

    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection, finalizeDrag]);

  const bounds = isDragging
    ? { a: dragStart, b: dragEnd }
    : selection
      ? { a: selection.a, b: selection.b }
      : { a: null, b: null };
  const stats = computeRangeChange(rows, bounds.a, bounds.b);
  const showBand = bounds.a != null && bounds.b != null && bounds.a !== bounds.b;

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a range and see its net change. Press Escape to clear the selection."
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
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={finalizeDrag}
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
              x1={Math.min(bounds.a!, bounds.b!)}
              x2={Math.max(bounds.a!, bounds.b!)}
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
