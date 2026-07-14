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

/** Selection stats returned to parent for display. */
export interface SelectionStats {
  /** Absolute dollar change (end - start) */
  dollarChange: number;
  /** Percent change ((end - start) / start * 100) */
  percentChange: number;
  /** Starting price in selection */
  startPrice: number;
  /** Ending price in selection */
  endPrice: number;
  /** Number of data points in selection */
  pointCount: number;
}

const MIN_SELECTION_POINTS = 2;

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

export interface PriceChartProps {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  /** Called when selection changes; null when selection is cleared. */
  onSelectionChange?: (stats: SelectionStats | null) => void;
}

export function PriceChart({
  data,
  variant = "daily",
  onSelectionChange,
}: PriceChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  // Drag selection state (reset automatically when component remounts via key prop).
  // Refs mirror the in-progress drag so pointer handlers read current values
  // synchronously, independent of React render/commit timing.
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [confirmedSelection, setConfirmedSelection] = useState<{ start: number; end: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragEndRef = useRef<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Calculate selection stats using full (non-downsampled) data for accuracy
  const calculateStats = useCallback(
    (startX: number, endX: number): SelectionStats | null => {
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const selectedPoints = fullRows.filter((r) => r.t >= minX && r.t <= maxX);
      if (selectedPoints.length < MIN_SELECTION_POINTS) return null;

      const startPrice = selectedPoints[0].price;
      const endPrice = selectedPoints[selectedPoints.length - 1].price;
      const dollarChange = endPrice - startPrice;
      const percentChange = (dollarChange / startPrice) * 100;

      return {
        dollarChange,
        percentChange,
        startPrice,
        endPrice,
        pointCount: selectedPoints.length,
      };
    },
    [fullRows]
  );

  // Handle mouse events for drag selection. Handlers read/update refs so they are
  // robust to render timing (recharts can fire mousemove before mousedown state commits).
  const toNumber = (label: string | number): number =>
    typeof label === "string" ? parseFloat(label) : label;

  const handleMouseDown = useCallback(
    (e: { activeLabel?: string | number }) => {
      if (e.activeLabel === undefined) return;
      const x = toNumber(e.activeLabel);
      dragStartRef.current = x;
      dragEndRef.current = x;
      setSelectionStart(x);
      setSelectionEnd(x);
      setIsDragging(true);
      setConfirmedSelection(null);
      onSelectionChange?.(null);
    },
    [onSelectionChange]
  );

  const handleMouseMove = useCallback((e: { activeLabel?: string | number }) => {
    if (dragStartRef.current === null || e.activeLabel === undefined) return;
    const x = toNumber(e.activeLabel);
    dragEndRef.current = x;
    setSelectionEnd(x);
  }, []);

  const handleMouseUp = useCallback(() => {
    const start = dragStartRef.current;
    const end = dragEndRef.current;
    dragStartRef.current = null;
    dragEndRef.current = null;
    setIsDragging(false);
    if (start === null || end === null) return;
    const stats = calculateStats(start, end);
    if (stats) {
      setConfirmedSelection({ start, end });
      onSelectionChange?.(stats);
    } else {
      setSelectionStart(null);
      setSelectionEnd(null);
      setConfirmedSelection(null);
      onSelectionChange?.(null);
    }
  }, [calculateStats, onSelectionChange]);

  // Handle Escape key to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (confirmedSelection || isDragging)) {
        dragStartRef.current = null;
        dragEndRef.current = null;
        setSelectionStart(null);
        setSelectionEnd(null);
        setConfirmedSelection(null);
        setIsDragging(false);
        onSelectionChange?.(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmedSelection, isDragging, onSelectionChange]);

  // Handle click outside to clear selection
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chartRef.current && !chartRef.current.contains(e.target as Node) && confirmedSelection) {
        dragStartRef.current = null;
        dragEndRef.current = null;
        setSelectionStart(null);
        setSelectionEnd(null);
        setConfirmedSelection(null);
        onSelectionChange?.(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [confirmedSelection, onSelectionChange]);

  // Selection bounds for rendering
  const selectionBounds = useMemo(() => {
    if (confirmedSelection) {
      return {
        x1: Math.min(confirmedSelection.start, confirmedSelection.end),
        x2: Math.max(confirmedSelection.start, confirmedSelection.end),
      };
    }
    if (isDragging && selectionStart !== null && selectionEnd !== null) {
      return {
        x1: Math.min(selectionStart, selectionEnd),
        x2: Math.max(selectionStart, selectionEnd),
      };
    }
    return null;
  }, [confirmedSelection, isDragging, selectionStart, selectionEnd]);

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

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={chartRef}
      role="img"
      aria-label="Price over time line chart. Drag to select a range and view net change."
      style={{ width: "100%", height: "100%", cursor: isDragging ? "crosshair" : "default" }}
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
          {selectionBounds && (
            <ReferenceArea
              x1={selectionBounds.x1}
              x2={selectionBounds.x2}
              fill="var(--accent)"
              fillOpacity={0.15}
              stroke="var(--accent)"
              strokeOpacity={0.6}
              strokeWidth={1}
              ifOverflow="hidden"
              className="selection-area"
            />
          )}
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
