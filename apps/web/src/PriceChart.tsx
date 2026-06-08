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
import { useEffect, useRef, useState, useMemo } from "react";
import type { CategoricalChartState } from "recharts/types/chart/types";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";
import {
  chartEventToTimestamp,
  computeRangeNetChange,
  normalizeSelectionRange,
  type RangeNetChange,
} from "./priceChartSelection";

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

export type PriceChartVariant = "daily" | "intraday";

type SelectionBounds = { startMs: number; endMs: number };

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onSelectionChange?: (change: RangeNetChange | null) => void;
}) {
  const rows = chartData(data);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragBoundsRef = useRef<SelectionBounds | null>(null);
  const rowsRef = useRef(rows);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const [dragBounds, setDragBounds] = useState<SelectionBounds | null>(null);
  const [committedBounds, setCommittedBounds] = useState<SelectionBounds | null>(null);

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

  const visibleBounds = dragBounds ?? committedBounds;

  const clearSelection = () => {
    draggingRef.current = false;
    dragBoundsRef.current = null;
    setDragBounds(null);
    setCommittedBounds(null);
    onSelectionChangeRef.current?.(null);
  };

  const finalizeSelection = (startMs: number, endMs: number) => {
    const range = normalizeSelectionRange(startMs, endMs);
    const netChange = computeRangeNetChange(rowsRef.current, range);
    if (!netChange) {
      clearSelection();
      return;
    }
    setCommittedBounds(range);
    setDragBounds(null);
    dragBoundsRef.current = null;
    draggingRef.current = false;
    onSelectionChangeRef.current?.(netChange);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      draggingRef.current = false;
      dragBoundsRef.current = null;
      setDragBounds(null);
      setCommittedBounds(null);
      onSelectionChangeRef.current?.(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!committedBounds) return;

    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      draggingRef.current = false;
      dragBoundsRef.current = null;
      setDragBounds(null);
      setCommittedBounds(null);
      onSelectionChangeRef.current?.(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [committedBounds]);

  useEffect(() => {
    const onWindowMouseUp = () => {
      if (!draggingRef.current || !dragBoundsRef.current) return;
      const { startMs, endMs } = dragBoundsRef.current;
      const range = normalizeSelectionRange(startMs, endMs);
      const netChange = computeRangeNetChange(rowsRef.current, range);
      if (!netChange) {
        draggingRef.current = false;
        dragBoundsRef.current = null;
        setDragBounds(null);
        setCommittedBounds(null);
        onSelectionChangeRef.current?.(null);
        return;
      }
      setCommittedBounds(range);
      setDragBounds(null);
      dragBoundsRef.current = null;
      draggingRef.current = false;
      onSelectionChangeRef.current?.(netChange);
    };

    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  const handleMouseDown = (state: CategoricalChartState) => {
    const timestamp = chartEventToTimestamp(state);
    if (timestamp == null) return;
    draggingRef.current = true;
    setCommittedBounds(null);
    onSelectionChangeRef.current?.(null);
    const next = { startMs: timestamp, endMs: timestamp };
    dragBoundsRef.current = next;
    setDragBounds(next);
  };

  const handleMouseMove = (state: CategoricalChartState) => {
    if (!draggingRef.current || !dragBoundsRef.current) return;
    const timestamp = chartEventToTimestamp(state);
    if (timestamp == null) return;
    const next = { startMs: dragBoundsRef.current.startMs, endMs: timestamp };
    dragBoundsRef.current = next;
    setDragBounds(next);
  };

  const handleMouseUp = () => {
    if (!draggingRef.current || !dragBoundsRef.current) return;
    finalizeSelection(dragBoundsRef.current.startMs, dragBoundsRef.current.endMs);
  };

  if (rows.length === 0) {
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="price-chart-interactive"
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a time range and view net price change."
      aria-describedby="price-chart-selection-hint"
    >
      <p id="price-chart-selection-hint" className="sr-only">
        Click and drag across the chart to select a time range. Press Escape to clear the selection.
        Keyboard-only range selection is not supported in this release.
      </p>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
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
          {visibleBounds && (
            <ReferenceArea
              x1={visibleBounds.startMs}
              x2={visibleBounds.endMs}
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeOpacity={0.45}
              ifOverflow="hidden"
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
