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
import { computeRangeChange, downsampleRows, type RangeChange } from "./priceChartData";

const MAX_DAILY_RENDER_POINTS = 1_200;

const chartData = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

function spanCalendarDays(rows: { t: number }[]): number {
  if (rows.length < 2) return 0;
  return (rows[rows.length - 1]!.t - rows[0]!.t) / 86_400_000;
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

function activeLabelToMs(label: unknown): number | null {
  if (typeof label === "number" && Number.isFinite(label)) return label;
  if (typeof label === "string" && label.trim() !== "") {
    const n = Number(label);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export type PriceChartVariant = "daily" | "intraday";

export type { RangeChange };

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onSelectionChange?: (r: RangeChange | null) => void;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clearSelection = useCallback(() => {
    setDragStart(null);
    setDragEnd(null);
    setIsDragging(false);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  const emitSelection = useCallback(
    (tA: number, tB: number) => {
      const stats = computeRangeChange(fullRows, tA, tB);
      onSelectionChange?.(stats);
    },
    [fullRows, onSelectionChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = wrapperRef.current;
      if (!el || el.contains(e.target as Node)) return;
      if (dragStart != null || dragEnd != null) clearSelection();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [clearSelection, dragStart, dragEnd]);

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
      const dataStart = rows[0]!.t;
      const dataEnd = rows[rows.length - 1]!.t;
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const selectionX1 = dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null;
  const selectionX2 = dragStart != null && dragEnd != null ? Math.max(dragStart, dragEnd) : null;

  const handleMouseDown = (state: { activeLabel?: unknown }) => {
    const t = activeLabelToMs(state.activeLabel);
    if (t == null) return;
    setDragStart(t);
    setDragEnd(t);
    setIsDragging(true);
  };

  const handleMouseMove = (state: { activeLabel?: unknown }) => {
    if (!isDragging || dragStart == null) return;
    const t = activeLabelToMs(state.activeLabel);
    if (t == null) return;
    setDragEnd(t);
    emitSelection(dragStart, t);
  };

  const handleMouseUp = (state: { activeLabel?: unknown }) => {
    if (!isDragging || dragStart == null) return;
    const t = activeLabelToMs(state.activeLabel) ?? dragEnd ?? dragStart;
    setDragEnd(t);
    setIsDragging(false);
    emitSelection(dragStart, t);
  };

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        No data to chart.
      </p>
    );
  }

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a range and view net change. Press Escape to clear selection."
      className="price-chart-wrap"
      style={{ width: "100%", height: "100%" }}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
          {selectionX1 != null && selectionX2 != null ? (
            <ReferenceArea
              x1={selectionX1}
              x2={selectionX2}
              fill="var(--accent)"
              fillOpacity={0.15}
              strokeOpacity={0}
              ifOverflow="hidden"
            />
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
          {!isDragging ? (
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
          ) : null}
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
  );
}
