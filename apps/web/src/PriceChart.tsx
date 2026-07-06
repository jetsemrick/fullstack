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
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
const PLOT_LEFT_OFFSET_PX = 60;
const PLOT_RIGHT_OFFSET_PX = 10;

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

function resolveNumericDomain(domain: [number, number] | [string, string], rows: RangeRow[]): [number, number] {
  if (typeof domain[0] === "number" && typeof domain[1] === "number") {
    return [domain[0], domain[1]];
  }
  return [rows[0]?.t ?? 0, rows[rows.length - 1]?.t ?? 0];
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

  const selectionDomain = useMemo(() => resolveNumericDomain(xDomain, fullRows), [xDomain, fullRows]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);

  const clearSelection = useCallback(() => {
    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(null);
  }, []);

  const timestampFromClientX = useCallback(
    (clientX: number, { clamp }: { clamp: boolean }): number | null => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect || fullRows.length === 0) return null;

      const plotLeft = rect.left + PLOT_LEFT_OFFSET_PX;
      const plotRight = rect.right - PLOT_RIGHT_OFFSET_PX;
      const plotWidth = plotRight - plotLeft;
      if (plotWidth <= 0) return null;

      const rawRatio = (clientX - plotLeft) / plotWidth;
      if (!clamp && (rawRatio < 0 || rawRatio > 1)) return null;

      const ratio = Math.min(1, Math.max(0, rawRatio));
      const [domainStart, domainEnd] = selectionDomain;
      const timestamp = domainStart + (domainEnd - domainStart) * ratio;
      return fullRows.reduce((nearest, row) =>
        Math.abs(row.t - timestamp) < Math.abs(nearest.t - timestamp) ? row : nearest,
      ).t;
    },
    [fullRows, selectionDomain],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const timestamp = timestampFromClientX(event.clientX, { clamp: false });
      if (timestamp == null) {
        clearSelection();
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { start: timestamp, end: timestamp };
      setDragStart(timestamp);
      setDragEnd(timestamp);
      setSelection(null);
    },
    [clearSelection, timestampFromClientX],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current.start == null) return;
      const timestamp = timestampFromClientX(event.clientX, { clamp: true });
      if (timestamp == null) return;

      dragRef.current.end = timestamp;
      setDragEnd(timestamp);
    },
    [timestampFromClientX],
  );

  const finalizeDrag = useCallback(() => {
    const { start, end } = dragRef.current;
    if (start == null) return;

    dragRef.current = { start: null, end: null };
    setDragStart(null);
    setDragEnd(null);
    setSelection(end != null && start !== end ? { start, end } : null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearSelection();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current && !wrapperRef.current.contains(target)) {
        clearSelection();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [clearSelection]);

  const selectionBounds = dragStart != null && dragEnd != null
    ? { start: dragStart, end: dragEnd }
    : selection;
  const stats = computeRangeChange(fullRows, selectionBounds?.start, selectionBounds?.end);

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label="Price over time line chart. Drag horizontally to select a range and see its net change. Press Escape to clear the selection."
      style={{ width: "100%", height: "100%", position: "relative", userSelect: dragStart != null ? "none" : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finalizeDrag}
      onPointerCancel={finalizeDrag}
    >
      {stats && (
        <div className="chart-selection-stats" role="status" aria-live="polite">
          <span className="chart-selection-stats__range">
            {formatTooltipWhen(stats.startMs, variant, spanDays)} - {formatTooltipWhen(stats.endMs, variant, spanDays)}
          </span>
          <span className={`metric-badge ${stats.status}`}>
            {formatSignedPrice(stats.diff)} ({formatSignedPercent(stats.pct)})
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
          {selectionBounds != null && selectionBounds.start !== selectionBounds.end ? (
            <ReferenceArea
              x1={Math.min(selectionBounds.start, selectionBounds.end)}
              x2={Math.max(selectionBounds.start, selectionBounds.end)}
              fill="var(--accent)"
              fillOpacity={0.12}
              stroke="var(--accent)"
              strokeOpacity={0.45}
              ifOverflow="visible"
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
