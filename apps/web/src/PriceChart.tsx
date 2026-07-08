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
import { computeRangeNetChange, downsampleRows, type ChartRow, type RangeNetChange } from "./priceChartData";

const MAX_DAILY_RENDER_POINTS = 1_200;

const chartData = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

type ChartInteractionState = {
  activeLabel?: unknown;
  activePayload?: Array<{ payload?: Partial<ChartRow> }>;
};

function chartEventMs(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;

  const interaction = state as ChartInteractionState;
  const payloadMs = interaction.activePayload?.[0]?.payload?.t;
  if (typeof payloadMs === "number" && Number.isFinite(payloadMs)) return payloadMs;

  if (typeof interaction.activeLabel === "number" && Number.isFinite(interaction.activeLabel)) {
    return interaction.activeLabel;
  }

  if (typeof interaction.activeLabel === "string") {
    const parsed = Number(interaction.activeLabel);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

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

type PriceChartProps = {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  selectedRange: RangeNetChange | null;
  onRangeChange: (range: RangeNetChange | null) => void;
};

export function PriceChart({ data, variant = "daily", selectedRange, onRangeChange }: PriceChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const instructionsId = useId().replace(/:/g, "");
  const [draftRange, setDraftRange] = useState<{ startMs: number; currentMs: number } | null>(null);
  const draftRangeRef = useRef<{ startMs: number; currentMs: number } | null>(null);
  const onRangeChangeRef = useRef(onRangeChange);
  const removeWindowMouseUpRef = useRef<(() => void) | null>(null);
  const removeWindowKeyDownRef = useRef<(() => void) | null>(null);
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

  useEffect(() => {
    onRangeChangeRef.current = onRangeChange;
  }, [onRangeChange]);

  useEffect(() => () => {
    removeWindowMouseUpRef.current?.();
    removeWindowKeyDownRef.current?.();
  }, []);

  const clearDraftRange = useCallback((clearSelection: boolean) => {
    removeWindowMouseUpRef.current?.();
    removeWindowKeyDownRef.current?.();
    removeWindowMouseUpRef.current = null;
    removeWindowKeyDownRef.current = null;
    draftRangeRef.current = null;
    setDraftRange(null);
    if (clearSelection) onRangeChangeRef.current(null);
  }, []);

  const finalizeDraftRange = useCallback((endMs: number | null) => {
    const current = draftRangeRef.current;
    const finalEndMs = endMs ?? current?.currentMs;

    if (current && finalEndMs != null) {
      const nextRange = computeRangeNetChange(fullRows, current.startMs, finalEndMs);
      if (nextRange) onRangeChangeRef.current(nextRange);
    }

    clearDraftRange(false);
  }, [clearDraftRange, fullRows]);

  const cancelSelection = useCallback(() => {
    clearDraftRange(true);
  }, [clearDraftRange]);

  function bindWindowKeyDown() {
    removeWindowKeyDownRef.current?.();

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelSelection();
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    removeWindowKeyDownRef.current = () => window.removeEventListener("keydown", handleWindowKeyDown);
  }

  function bindWindowMouseUp() {
    removeWindowMouseUpRef.current?.();

    function handleWindowMouseUp() {
      removeWindowMouseUpRef.current = null;
      finalizeDraftRange(null);
    }

    window.addEventListener("mouseup", handleWindowMouseUp);
    removeWindowMouseUpRef.current = () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }

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

  const displayedRange = draftRange
    ? { startMs: Math.min(draftRange.startMs, draftRange.currentMs), endMs: Math.max(draftRange.startMs, draftRange.currentMs) }
    : selectedRange;

  function handleMouseDown(state: unknown) {
    const ms = chartEventMs(state);
    if (ms == null) return;
    const nextRange = { startMs: ms, currentMs: ms };
    draftRangeRef.current = nextRange;
    setDraftRange(nextRange);
    bindWindowMouseUp();
    bindWindowKeyDown();
  }

  function handleMouseMove(state: unknown) {
    const ms = chartEventMs(state);
    if (ms == null) return;
    setDraftRange((current) => {
      if (!current) return current;
      const nextRange = { ...current, currentMs: ms };
      draftRangeRef.current = nextRange;
      return nextRange;
    });
  }

  function handleMouseUp(state: unknown) {
    const endMs = chartEventMs(state) ?? draftRange?.currentMs ?? null;
    finalizeDraftRange(endMs);
  }

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      role="img"
      aria-label="Price over time line chart"
      aria-describedby={instructionsId}
      tabIndex={0}
      className="chart-interaction-surface"
      onKeyDown={(event) => {
        if (event.key === "Escape") cancelSelection();
      }}
    >
      <span id={instructionsId} className="sr-only">
        Drag horizontally across the chart to select a range. Press Escape or click outside the chart to clear the range.
      </span>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
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
          {displayedRange ? (
            <ReferenceArea
              x1={displayedRange.startMs}
              x2={displayedRange.endMs}
              fill="var(--accent)"
              fillOpacity={0.14}
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
