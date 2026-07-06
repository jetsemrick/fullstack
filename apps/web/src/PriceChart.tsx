import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";
import { getOpenPrice, getOverallTrend } from "./openPriceColoring";

const MAX_DAILY_RENDER_POINTS = 1_200;

const chartData = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

const CHART_GREEN = "#10B981";
const CHART_RED = "#EF4444";

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

export function PriceChart({ data, variant = "daily" }: { data: GetPricesResponse; variant?: PriceChartVariant }) {
  const fillGradientId = useId().replace(/:/g, "");
  const greenGradientId = `${fillGradientId}-green`;
  const redGradientId = `${fillGradientId}-red`;

  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;

  const openPrice = useMemo(() => {
    if (variant === "intraday") return null;
    return getOpenPrice(data);
  }, [data, variant]);

  const useOpenColoring = variant === "daily" && openPrice !== null;

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

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div role="img" aria-label="Price over time line chart" style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
            {useOpenColoring && (
              <>
                <linearGradient id={greenGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id={redGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_RED} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_RED} stopOpacity={0.05} />
                </linearGradient>
              </>
            )}
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
          {useOpenColoring && (
            <ReferenceLine
              y={openPrice}
              stroke="var(--fg-muted)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `Open: ${formatPrice(openPrice)}`,
                position: "insideTopRight",
                fill: "var(--fg-muted)",
                fontSize: 11,
              }}
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
            formatter={(value: number | string) => {
              if (typeof value !== "number") return [value, "Close"];
              return [formatPrice(value), "Close"];
            }}
          />
          {useOpenColoring ? (
            <Area
              type="linear"
              dataKey="price"
              stroke={getOverallTrend(rows, openPrice!) === "negative" ? CHART_RED : CHART_GREEN}
              strokeWidth={2}
              fill={`url(#${getOverallTrend(rows, openPrice!) === "negative" ? redGradientId : greenGradientId})`}
              baseValue="dataMin"
              dot={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: getOverallTrend(rows, openPrice!) === "negative" ? CHART_RED : CHART_GREEN }}
              isAnimationActive={false}
            />
          ) : (
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
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
