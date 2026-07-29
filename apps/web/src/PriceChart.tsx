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
import { computeRangeStats, type RangeStats } from "./rangeSelection";

const MAX_DAILY_RENDER_POINTS = 1_200;

const chartData = (data: GetPricesResponse) =>
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

/** Subset of the Recharts chart state this component reads; avoids importing Recharts internal types. */
type ChartMouseState = { activeTooltipIndex?: number };

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  /** Called with the net change for the brushed window, or null when nothing is selected. */
  onSelectionChange?: (stats: RangeStats | null) => void;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ anchorMs: number; currentMs: number } | null>(null);
  const [selection, setSelection] = useState<{ startMs: number; endMs: number } | null>(null);
  const dragRef = useRef(drag);
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

  const clearSelection = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setSelection(null);
  }, []);

  const isDragging = drag != null;

  const onChartMouseDown = useCallback(
    (state: ChartMouseState) => {
      const index = state?.activeTooltipIndex;
      const t = index == null ? undefined : rows[index]?.t;
      if (t == null) return;
      setSelection(null);
      // Keep the ref current during the gesture; pointerup must not wait for an effect flush.
      const next = { anchorMs: t, currentMs: t };
      dragRef.current = next;
      setDrag(next);
    },
    [rows],
  );

  const onChartMouseMove = useCallback(
    (state: ChartMouseState) => {
      const index = state?.activeTooltipIndex;
      const t = index == null ? undefined : rows[index]?.t;
      if (t == null) return;
      setDrag((prev) => {
        if (prev == null || prev.currentMs === t) return prev;
        const next = { ...prev, currentMs: t };
        dragRef.current = next;
        return next;
      });
    },
    [rows],
  );

  // Pointer release is handled on the window so a drag that ends outside the plot still commits.
  useEffect(() => {
    if (!isDragging) return;
    const finish = () => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current || current.anchorMs === current.currentMs) return;
      setSelection({
        startMs: Math.min(current.anchorMs, current.currentMs),
        endMs: Math.max(current.anchorMs, current.currentMs),
      });
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!selection && !isDragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selection, isDragging, clearSelection]);

  const activeWindow = useMemo(() => {
    if (drag) {
      return { startMs: Math.min(drag.anchorMs, drag.currentMs), endMs: Math.max(drag.anchorMs, drag.currentMs) };
    }
    return selection;
  }, [drag, selection]);

  // Stats come from the full series so downsampling of the daily view cannot shift the endpoints.
  const stats = useMemo(() => {
    if (!activeWindow) return null;
    return computeRangeStats(fullRows, activeWindow.startMs, activeWindow.endMs);
  }, [fullRows, activeWindow]);

  useEffect(() => {
    onSelectionChange?.(stats);
  }, [stats, onSelectionChange]);

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const selectionStroke =
    stats?.direction === "up" ? "#2b703e" : stats?.direction === "down" ? "#ba3b3b" : "var(--fg-muted)";

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Price over time line chart. Drag across the chart to measure net change for a range."
      style={{ width: "100%", height: "100%", userSelect: "none", touchAction: "pan-y" }}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={onChartMouseDown}
          onMouseMove={onChartMouseMove}
          style={{ cursor: isDragging ? "col-resize" : "crosshair" }}
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
          {activeWindow && activeWindow.startMs !== activeWindow.endMs ? (
            <ReferenceArea
              x1={activeWindow.startMs}
              x2={activeWindow.endMs}
              fill={selectionStroke}
              fillOpacity={0.12}
              stroke={selectionStroke}
              strokeOpacity={0.45}
              ifOverflow="hidden"
              isFront
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
