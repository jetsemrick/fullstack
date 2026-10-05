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
import { rangeNetChange, type RangeNetChangeResult } from "./rangeNetChange";

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

function labelToMs(label: unknown): number | null {
  if (typeof label === "number" && Number.isFinite(label)) return label;
  if (typeof label === "string" && label !== "") {
    const n = Number(label);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export type PriceChartVariant = "daily" | "intraday";

type TimeSpan = { startMs: number; endMs: number };

export function PriceChart({
  data,
  variant = "daily",
  onRangeSelect,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onRangeSelect?: (result: RangeNetChangeResult | null) => void;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const [dragAnchor, setDragAnchor] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [committedSpan, setCommittedSpan] = useState<TimeSpan | null>(null);
  const draggingRef = useRef(false);
  const dragAnchorRef = useRef<number | null>(null);
  const dragCurrentRef = useRef<number | null>(null);

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
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const activeSpan = useMemo((): TimeSpan | null => {
    if (dragAnchor != null && dragCurrent != null) {
      return { startMs: dragAnchor, endMs: dragCurrent };
    }
    return committedSpan;
  }, [dragAnchor, dragCurrent, committedSpan]);

  const commitSpan = useCallback(
    (startMs: number, endMs: number) => {
      const span = { startMs, endMs };
      setCommittedSpan(span);
      setDragAnchor(null);
      setDragCurrent(null);
      draggingRef.current = false;
      const result = rangeNetChange(fullRows, startMs, endMs);
      onRangeSelect?.(result);
    },
    [fullRows, onRangeSelect],
  );

  const updateDragFromEvent = useCallback((activeLabel: unknown) => {
    const ms = labelToMs(activeLabel);
    if (ms == null) return;
    dragCurrentRef.current = ms;
    setDragCurrent(ms);
  }, []);

  const onChartMouseDown = useCallback(
    (state: { activeLabel?: unknown }) => {
      const ms = labelToMs(state?.activeLabel);
      if (ms == null) return;
      draggingRef.current = true;
      dragAnchorRef.current = ms;
      dragCurrentRef.current = ms;
      setDragAnchor(ms);
      setDragCurrent(ms);
      setCommittedSpan(null);
      onRangeSelect?.(null);
    },
    [onRangeSelect],
  );

  const onChartMouseMove = useCallback(
    (state: { activeLabel?: unknown }) => {
      if (!draggingRef.current) return;
      updateDragFromEvent(state?.activeLabel);
    },
    [updateDragFromEvent],
  );

  const finishDrag = useCallback(() => {
    const start = dragAnchorRef.current;
    const end = dragCurrentRef.current;
    if (!draggingRef.current || start == null || end == null) {
      draggingRef.current = false;
      return;
    }
    commitSpan(start, end);
  }, [commitSpan]);

  useEffect(() => {
    const onWindowPointerUp = () => {
      if (draggingRef.current) finishDrag();
    };
    window.addEventListener("mouseup", onWindowPointerUp);
    window.addEventListener("touchend", onWindowPointerUp);
    return () => {
      window.removeEventListener("mouseup", onWindowPointerUp);
      window.removeEventListener("touchend", onWindowPointerUp);
    };
  }, [finishDrag]);

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const selectionX1 = activeSpan ? Math.min(activeSpan.startMs, activeSpan.endMs) : null;
  const selectionX2 = activeSpan ? Math.max(activeSpan.startMs, activeSpan.endMs) : null;

  return (
    <div
      className="price-chart"
      role="group"
      aria-label="Price over time line chart"
      style={{ width: "100%", height: "100%" }}
    >
      <p className="sr-only">
        Drag horizontally across the chart to select a time range and view net price change for that selection.
      </p>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={onChartMouseDown}
          onMouseMove={onChartMouseMove}
          onMouseUp={finishDrag}
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
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeOpacity={0.45}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
