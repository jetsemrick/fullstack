import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import {
  SERIES_COLORS,
  alignAndIndexSeries,
  downsampleMultiRows,
  downsampleRows,
  type MultiSeriesRow,
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

function formatIndexed(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function computeYDomain(rows: MultiSeriesRow[], tickers: string[]): [number, number] | ["auto", "auto"] {
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const ticker of tickers) {
      const value = row[ticker];
      if (typeof value === "number" && Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return ["auto", "auto"];
  const pad = Math.max((max - min) * 0.05, 0.5);
  return [min - pad, max + pad];
}

function activeTickers(rows: MultiSeriesRow[], tickers: string[]): string[] {
  return tickers.filter((ticker) => rows.some((row) => typeof row[ticker] === "number"));
}

export type PriceChartVariant = "daily" | "intraday";
export type PriceChartMode = "absolute" | "indexed";

export function PriceChart({
  series,
  comparing = false,
  mode = "absolute",
  variant = "daily",
}: {
  series: GetPricesResponse[];
  comparing?: boolean;
  mode?: PriceChartMode;
  variant?: PriceChartVariant;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const compareMode = comparing || series.length >= 2;

  const { fullRows, tickers } = useMemo(() => {
    if (compareMode) {
      const aligned = alignAndIndexSeries(series, mode);
      return { fullRows: aligned.rows, tickers: aligned.tickers };
    }
    const single = series[0];
    if (!single) return { fullRows: [] as MultiSeriesRow[], tickers: [] as string[] };
    return {
      fullRows: chartData(single).map((r) => ({ t: r.t, price: r.price })),
      tickers: [single.ticker],
    };
  }, [series, compareMode, mode]);

  const renderedTickers = useMemo(
    () => (compareMode ? activeTickers(fullRows, tickers) : tickers),
    [compareMode, fullRows, tickers],
  );

  const rows = useMemo(() => {
    if (fullRows.length === 0) return fullRows;
    if (variant === "intraday") return fullRows;
    if (compareMode) {
      return downsampleMultiRows(fullRows, tickers, MAX_DAILY_RENDER_POINTS);
    }
    return downsampleRows(
      fullRows.map((r) => ({ t: r.t, price: r.price ?? 0 })),
      MAX_DAILY_RENDER_POINTS,
    ).map((r) => ({ t: r.t, price: r.price }));
  }, [fullRows, variant, compareMode, tickers]);

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
    if (compareMode) return ["dataMin", "dataMax"];
    if (variant === "intraday" && sessionLayout && rows.length > 0) {
      const dataStart = rows[0]!.t;
      const dataEnd = rows[rows.length - 1]!.t;
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows, compareMode]);

  const xTicks = variant === "intraday" && !compareMode ? intradayTicks : undefined;

  const valueFormatter = mode === "indexed" ? formatIndexed : formatPrice;
  const yAxisLabel = mode === "indexed" ? "Indexed (100 = start)" : undefined;
  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (compareMode) return computeYDomain(rows, renderedTickers);
    return ["auto", "auto"];
  }, [compareMode, rows, renderedTickers]);

  if (rows.length === 0) {
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;
  }

  if (compareMode) {
    return (
      <div
        role="img"
        aria-label="Price over time line chart"
        style={{ width: "100%", height: "100%" }}
      >
        <ResponsiveContainer width="100%" height="100%" minHeight={320}>
          <LineChart
            data={rows}
            margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(ms: number) => formatDailyAxisTick(ms, spanDays)}
              minTickGap={32}
              dy={10}
            />
            <YAxis
              domain={yDomain}
              width={72}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => valueFormatter(v)}
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
                  return formatTooltipWhen(t, "daily", spanDays);
                }
                return "";
              }}
              formatter={(value: number | string, name: string) => [
                typeof value === "number" ? valueFormatter(value) : value,
                name,
              ]}
            />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
            {renderedTickers.map((ticker, i) => (
              <Line
                key={ticker}
                type="linear"
                dataKey={ticker}
                name={ticker}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div role="img" aria-label="Price over time line chart" style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: compareMode ? 28 : 10, right: 10, left: compareMode ? 8 : 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
          {variant === "intraday" && sessionLayout && !compareMode ? (
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
            scale={compareMode ? "linear" : "time"}
            ticks={xTicks}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            minTickGap={variant === "intraday" ? 0 : 32}
            dy={10}
          />
          <YAxis
            {...(compareMode ? {} : { dataKey: "price" })}
            domain={yDomain}
            width={compareMode ? 72 : 60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => valueFormatter(v)}
            dx={-10}
            label={
              yAxisLabel
                ? {
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--fg-muted)",
                    fontSize: 11,
                    dx: -4,
                  }
                : undefined
            }
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
            formatter={(value: number | string, name: string) => [
              typeof value === "number" ? valueFormatter(value) : value,
              name,
            ]}
          />
          <Area
            type="linear"
            dataKey="price"
            stroke={SERIES_COLORS[0]}
            strokeWidth={3}
            fill={`url(#${fillGradientId})`}
            baseValue="dataMin"
            dot={false}
            activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: SERIES_COLORS[0] }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
