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
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { netChangeForWindow, type RangeNetChange } from "./chartRangeSelect";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";

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
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type PriceChartVariant = "daily" | "intraday";

export function PriceChart({
  data,
  variant = "daily",
  onRangeChange,
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  onRangeChange?: (value: RangeNetChange | null) => void;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const hintId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const brushARef = useRef<number | null>(null);
  const brushBRef = useRef<number | null>(null);

  const [brushA, setBrushA] = useState<number | null>(null);
  const [brushB, setBrushB] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [kbIndex, setKbIndex] = useState<number | null>(null);

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

  const applyBrush = useCallback((a: number | null, b: number | null, emit: boolean) => {
    brushARef.current = a;
    brushBRef.current = b;
    setBrushA(a);
    setBrushB(b);
    if (!emit) return;
    if (a == null || b == null) {
      onRangeChange?.(null);
      return;
    }
    onRangeChange?.(netChangeForWindow(fullRows, a, b));
  }, [fullRows, onRangeChange]);

  const clearSelection = useCallback(() => {
    draggingRef.current = false;
    setDragging(false);
    setKbIndex(null);
    applyBrush(null, null, true);
  }, [applyBrush]);

  const finishDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const a = brushARef.current;
    const b = brushBRef.current;
    if (a == null || b == null || netChangeForWindow(fullRows, a, b) == null) {
      applyBrush(null, null, true);
      return;
    }
    applyBrush(a, b, true);
  }, [applyBrush, fullRows]);

  useEffect(() => {
    if (!dragging) return;
    const onUp = () => finishDrag();
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, finishDrag]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (draggingRef.current) return;
      if (brushARef.current == null) return;
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest("[data-range-select-ui]")) return;
      clearSelection();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [clearSelection]);

  const onChartMouseDown = (state: { activeLabel?: unknown }) => {
    const t = labelToMs(state?.activeLabel);
    if (t == null) return;
    draggingRef.current = true;
    setDragging(true);
    applyBrush(t, t, true);
  };

  const onChartMouseMove = (state: { activeLabel?: unknown }) => {
    if (!draggingRef.current) return;
    const t = labelToMs(state?.activeLabel);
    if (t == null) return;
    applyBrush(brushARef.current, t, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearSelection();
      return;
    }
    if (rows.length < 2) return;
    const last = rows.length - 1;
    if (e.key === "Enter") {
      e.preventDefault();
      const start = kbIndex ?? Math.floor(last / 2);
      const next = Math.min(last, start + 1);
      setKbIndex(start);
      applyBrush(rows[start]!.t, rows[next]!.t, true);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const current = kbIndex ?? Math.floor(last / 2);
    const next = Math.max(0, Math.min(last, current + delta));
    setKbIndex(next);
    const startT = brushARef.current ?? rows[current]!.t;
    applyBrush(startT, rows[next]!.t, true);
  };

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const showBrush = brushA != null && brushB != null && brushA !== brushB;

  return (
    <div
      ref={wrapRef}
      className="price-chart"
      role="group"
      tabIndex={0}
      aria-label="Price over time line chart. Drag to select a range for net change. Keyboard: Enter starts a range, arrow keys move the end, Escape clears."
      aria-describedby={hintId}
      onKeyDown={onKeyDown}
    >
      <div className="price-chart__chrome">
        <p id={hintId} className="price-chart__hint">
          Drag across the chart to measure net change for that range. Press Escape or click outside to clear.
          Keyboard: focus the chart, press Enter to start a range, then Left or Right to move the end of the selection.
        </p>
        {showBrush && !dragging ? (
          <button type="button" className="range-clear-btn" onClick={clearSelection}>
            Clear range
          </button>
        ) : null}
      </div>
      <div className="price-chart__plot">
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={onChartMouseDown}
          onMouseMove={onChartMouseMove}
          style={{ cursor: dragging ? "ew-resize" : "crosshair", userSelect: "none" }}
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
          {showBrush ? (
            <ReferenceArea
              x1={Math.min(brushA, brushB)}
              x2={Math.max(brushA, brushB)}
              fill="var(--accent)"
              fillOpacity={0.18}
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
    </div>
  );
}
