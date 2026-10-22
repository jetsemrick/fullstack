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
import { useCallback, useId, useMemo, useState } from "react";
import type { CategoricalChartState } from "recharts/types/chart/types";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";
import {
  chartXToMs,
  normalizeTimeRange,
  resolveXDomainMs,
  type ChartTimeRange,
} from "./chartRangeBrush";

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

export type PriceChartProps = {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  /** Committed drag selection, owned by the parent so it can be cleared on ticker/horizon change. */
  selection?: ChartTimeRange | null;
  /** Called with the normalized range on drag end, or `null` when a click/empty drag clears it. */
  onSelectionChange?: (range: ChartTimeRange | null) => void;
};

type DragState = { startMs: number; currentMs: number };

/**
 * Range selection is pointer-driven (click-drag across the plot). Keyboard users can
 * clear a selection with Escape or the "Clear range" button in the toolbar; creating a
 * selection via keyboard is a documented follow-up (see SI-33).
 */
export function PriceChart({ data, variant = "daily", selection = null, onSelectionChange }: PriceChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const [drag, setDrag] = useState<DragState | null>(null);
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

  /** Epoch ms under the pointer: snap to the nearest bar, else map pixels across the x-domain. */
  const pointerMs = useCallback(
    (state: CategoricalChartState | undefined): number | null => {
      if (!state) return null;
      const label: unknown = state.activeLabel;
      if (typeof label === "number" && Number.isFinite(label)) return label;
      if (typeof state.chartX !== "number" || !state.offset) return null;
      const [minMs, maxMs] = resolveXDomainMs(xDomain, rows);
      return chartXToMs(state.chartX - (state.offset.left ?? 0), state.offset.width ?? 0, minMs, maxMs);
    },
    [xDomain, rows],
  );

  const commitDrag = useCallback(
    (current: DragState | null) => {
      setDrag(null);
      if (!current) return;
      if (current.startMs === current.currentMs) {
        onSelectionChange?.(null);
        return;
      }
      onSelectionChange?.(normalizeTimeRange(current.startMs, current.currentMs));
    },
    [onSelectionChange],
  );

  const handleMouseDown = useCallback(
    (state: CategoricalChartState) => {
      const ms = pointerMs(state);
      if (ms == null) return;
      onSelectionChange?.(null);
      setDrag({ startMs: ms, currentMs: ms });
    },
    [pointerMs, onSelectionChange],
  );

  const handleMouseMove = useCallback(
    (state: CategoricalChartState) => {
      if (!drag) return;
      const ms = pointerMs(state);
      if (ms == null) return;
      setDrag((prev) => (prev && prev.currentMs !== ms ? { ...prev, currentMs: ms } : prev));
    },
    [drag, pointerMs],
  );

  const handleMouseUp = useCallback(() => commitDrag(drag), [commitDrag, drag]);

  const highlight: ChartTimeRange | null = drag
    ? normalizeTimeRange(drag.startMs, drag.currentMs)
    : selection;

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      role="img"
      aria-label="Price over time line chart. Drag horizontally across the chart to measure net change over a range."
      className={`price-chart${drag ? " price-chart--dragging" : ""}`}
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
          {highlight && highlight.startMs !== highlight.endMs ? (
            <ReferenceArea
              x1={highlight.startMs}
              x2={highlight.endMs}
              fill="var(--accent)"
              fillOpacity={0.16}
              stroke="var(--accent)"
              strokeOpacity={0.6}
              strokeWidth={1}
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
