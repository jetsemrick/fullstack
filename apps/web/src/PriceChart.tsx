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
import { getPriceChartSelectionFromRange, type PriceChartSelection } from "./priceChartSelection";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

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

type ChartPointerState = {
  activeLabel?: unknown;
  activePayload?: Array<{ payload?: { t?: number } }>;
};

function timestampFromChartState(state: unknown): number | null {
  const chartState = state as ChartPointerState | undefined;
  const payloadTime = chartState?.activePayload?.[0]?.payload?.t;
  if (typeof payloadTime === "number") return payloadTime;
  if (typeof chartState?.activeLabel === "number") return chartState.activeLabel;
  if (typeof chartState?.activeLabel === "string") {
    const parsed = Number(chartState.activeLabel);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onSelectionChange?: (selection: PriceChartSelection | null) => void;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const dragRangeRef = useRef<{ startMs: number; endMs: number } | null>(null);
  const [dragRange, setDragRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const [selection, setSelection] = useState<PriceChartSelection | null>(null);
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

  const clearSelection = useCallback(() => {
    dragRangeRef.current = null;
    setDragRange(null);
    setSelection(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }

    function onPointerDown(event: PointerEvent) {
      if (!selection) return;
      if (chartRef.current?.contains(event.target as Node)) return;
      clearSelection();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [clearSelection, selection]);

  const onMouseDown = useCallback((state: unknown) => {
    const t = timestampFromChartState(state);
    if (t == null) return;
    setSelection(null);
    onSelectionChange?.(null);
    const nextRange = { startMs: t, endMs: t };
    dragRangeRef.current = nextRange;
    setDragRange(nextRange);
  }, [onSelectionChange]);

  const onMouseMove = useCallback((state: unknown) => {
    const t = timestampFromChartState(state);
    if (t == null) return;
    setDragRange((current) => {
      if (!current) return current;
      const nextRange = { ...current, endMs: t };
      dragRangeRef.current = nextRange;
      return nextRange;
    });
  }, []);

  const finalizeSelection = useCallback((startMs: number, endMs: number) => {
    const nextSelection = getPriceChartSelectionFromRange(rows, startMs, endMs);
    setSelection(nextSelection);
    onSelectionChange?.(nextSelection);
    dragRangeRef.current = null;
    setDragRange(null);
  }, [onSelectionChange, rows]);

  const onMouseUp = useCallback((state: unknown) => {
    const currentRange = dragRangeRef.current;
    if (!currentRange) return;
    const endMs = timestampFromChartState(state) ?? currentRange.endMs;
    finalizeSelection(currentRange.startMs, endMs);
  }, [finalizeSelection]);

  useEffect(() => {
    if (!dragRange) return;

    function onDocumentMouseUp() {
      const currentRange = dragRangeRef.current;
      if (!currentRange) return;
      finalizeSelection(currentRange.startMs, currentRange.endMs);
    }

    document.addEventListener("mouseup", onDocumentMouseUp);
    return () => document.removeEventListener("mouseup", onDocumentMouseUp);
  }, [dragRange, finalizeSelection]);

  const visibleRange = dragRange ?? selection;

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={chartRef}
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a range; press Escape to clear the selection."
      style={{ width: "100%", height: "100%" }}
    >
      <p className="sr-only">
        Range selection is available with pointer drag on the chart. Keyboard users can press Escape to clear the active selection.
      </p>
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
          {visibleRange && visibleRange.startMs !== visibleRange.endMs && (
            <ReferenceArea
              x1={Math.min(visibleRange.startMs, visibleRange.endMs)}
              x2={Math.max(visibleRange.startMs, visibleRange.endMs)}
              stroke="var(--accent)"
              strokeOpacity={0.45}
              fill="var(--accent)"
              fillOpacity={0.12}
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
