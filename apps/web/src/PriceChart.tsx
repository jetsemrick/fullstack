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
import {
  calculateRangeSelection,
  downsampleRows,
  type PriceRangeSelection,
} from "./priceChartData";

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

type ChartInteractionState = {
  activeLabel?: number | string;
  activePayload?: Array<{ payload?: { t?: number } }>;
};

function activeTimestamp(state: ChartInteractionState | null): number | null {
  const payloadTime = state?.activePayload?.[0]?.payload?.t;
  if (typeof payloadTime === "number") return payloadTime;
  const label = Number(state?.activeLabel);
  return Number.isFinite(label) ? label : null;
}

type PriceChartProps = {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onSelectionChange?: (selection: PriceRangeSelection | null) => void;
};

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: PriceChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const instructionsId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragEndRef = useRef<number | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<[number, number] | null>(null);
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
    dragStartRef.current = null;
    dragEndRef.current = null;
    setSelectionBounds(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  const finishSelection = useCallback(() => {
    const firstTime = dragStartRef.current;
    const secondTime = dragEndRef.current;
    dragStartRef.current = null;
    dragEndRef.current = null;
    if (firstTime == null || secondTime == null) return;

    const selection = calculateRangeSelection(fullRows, firstTime, secondTime);
    if (!selection) {
      setSelectionBounds(null);
      onSelectionChange?.(null);
      return;
    }
    setSelectionBounds([selection.startTime, selection.endTime]);
    onSelectionChange?.(selection);
  }, [fullRows, onSelectionChange]);

  useEffect(() => {
    function onMouseUp() {
      if (dragStartRef.current != null) finishSelection();
    }

    function onPointerDown(event: PointerEvent) {
      if (!chartRef.current?.contains(event.target as Node) && dragStartRef.current == null) {
        clearSelection();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }

    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [clearSelection, finishSelection]);

  function handleMouseDown(state: ChartInteractionState | null) {
    const timestamp = activeTimestamp(state);
    if (timestamp == null) return;
    dragStartRef.current = timestamp;
    dragEndRef.current = timestamp;
    setSelectionBounds([timestamp, timestamp]);
    onSelectionChange?.(null);
  }

  function handleMouseMove(state: ChartInteractionState | null) {
    if (dragStartRef.current == null) return;
    const timestamp = activeTimestamp(state);
    if (timestamp == null) return;
    dragEndRef.current = timestamp;
    setSelectionBounds([
      Math.min(dragStartRef.current, timestamp),
      Math.max(dragStartRef.current, timestamp),
    ]);
  }

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={chartRef}
      role="img"
      aria-label="Price over time line chart with selectable ranges"
      aria-describedby={instructionsId}
      className="price-chart"
      tabIndex={0}
    >
      <span id={instructionsId} className="sr-only">
        Drag horizontally across the chart to calculate the change for a range. Press Escape or click outside the chart to clear the selection.
      </span>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
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
          {selectionBounds ? (
            <ReferenceArea
              x1={selectionBounds[0]}
              x2={selectionBounds[1]}
              fill="var(--accent)"
              fillOpacity={0.14}
              stroke="var(--accent)"
              strokeOpacity={0.65}
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
