import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import type { GetPricesResponse, CompareTickerData } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";

const MAX_DAILY_RENDER_POINTS = 1_200;

interface CompareTickerWithColor extends CompareTickerData {
  color: string;
}

const chartData = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

function normalizeToPercent(rows: { t: number; price: number }[]): { t: number; pctChange: number }[] {
  if (rows.length === 0) return [];
  const basePrice = rows[0].price;
  if (basePrice === 0) return rows.map(r => ({ t: r.t, pctChange: 0 }));
  return rows.map(r => ({
    t: r.t,
    pctChange: ((r.price - basePrice) / basePrice) * 100,
  }));
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

interface PriceChartProps {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  compareTickers?: CompareTickerWithColor[];
  primaryColor?: string;
}

export function PriceChart({ data, variant = "daily", compareTickers = [], primaryColor }: PriceChartProps) {
  const fillGradientId = useId().replace(/:/g, "");
  const isCompareMode = compareTickers.length > 0;
  
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
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const compareSeriesData = useMemo(() => {
    if (!isCompareMode) return [];
    return compareTickers
      .filter(ct => ct.data)
      .map(ct => {
        const ctRows = chartData(ct.data!);
        const downsampled = variant === "intraday" ? ctRows : downsampleRows(ctRows, MAX_DAILY_RENDER_POINTS);
        return {
          ticker: ct.ticker,
          color: ct.color,
          rows: normalizeToPercent(downsampled),
        };
      });
  }, [compareTickers, isCompareMode, variant]);

  const primaryPercentRows = useMemo(() => {
    if (!isCompareMode) return [];
    return normalizeToPercent(rows);
  }, [rows, isCompareMode]);

  const mergedCompareData = useMemo(() => {
    if (!isCompareMode) return [];
    
    const allTimestamps = new Set<number>();
    primaryPercentRows.forEach(r => allTimestamps.add(r.t));
    compareSeriesData.forEach(s => s.rows.forEach(r => allTimestamps.add(r.t)));
    
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    const primaryMap = new Map(primaryPercentRows.map(r => [r.t, r.pctChange]));
    const compareMaps = compareSeriesData.map(s => ({
      ticker: s.ticker,
      map: new Map(s.rows.map(r => [r.t, r.pctChange])),
    }));
    
    return sortedTimestamps.map(t => {
      const row: Record<string, number | undefined> = { t };
      row[data.ticker] = primaryMap.get(t);
      compareMaps.forEach(cm => {
        row[cm.ticker] = cm.map.get(t);
      });
      return row;
    });
  }, [isCompareMode, primaryPercentRows, compareSeriesData, data.ticker]);

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const effectivePrimaryColor = primaryColor || "var(--accent)";

  if (isCompareMode) {
    return (
      <div role="img" aria-label="Multi-ticker comparison chart" style={{ width: "100%", height: "100%" }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={320}>
          <ComposedChart data={mergedCompareData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              domain={["auto", "auto"]}
              width={60}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
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
              formatter={(value: number | string, name: string) => {
                if (typeof value === "number") {
                  const sign = value >= 0 ? "+" : "";
                  return [`${sign}${value.toFixed(2)}%`, name];
                }
                return [value, name];
              }}
            />
            <Line
              type="linear"
              dataKey={data.ticker}
              stroke={effectivePrimaryColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: effectivePrimaryColor }}
              isAnimationActive={false}
              connectNulls
            />
            {compareSeriesData.map((series) => (
              <Line
                key={series.ticker}
                type="linear"
                dataKey={series.ticker}
                stroke={series.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: series.color }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div role="img" aria-label="Price over time line chart" style={{ width: "100%", height: "100%" }}>
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
