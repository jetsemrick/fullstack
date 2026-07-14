import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import {
  downsampleWideRows,
  type ComparisonSeriesMeta,
  type ComparisonWideRow,
} from "./priceChartData";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";

const MAX_DAILY_RENDER_POINTS = 1_200;

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

function seriesColor(index: number): string {
  return `var(--series-${(index % 5) + 1})`;
}

export type PriceChartVariant = "daily" | "intraday";

export type ComparisonChartProps = {
  series: ComparisonSeriesMeta[];
  rows: ComparisonWideRow[];
  variant?: PriceChartVariant;
};

export function PriceChart({ series, rows, variant = "daily" }: ComparisonChartProps) {
  const tickers = useMemo(() => series.map((entry) => entry.ticker), [series]);
  const currencyByTicker = useMemo(
    () => new Map(series.map((entry) => [entry.ticker, entry.currency])),
    [series],
  );

  const renderedRows = useMemo(() => {
    if (variant === "intraday") return rows;
    return downsampleWideRows(rows, tickers, MAX_DAILY_RENDER_POINTS);
  }, [rows, tickers, variant]);

  const anchorMs = renderedRows.length > 0 ? renderedRows[renderedRows.length - 1]!.t : 0;
  const spanDays = spanCalendarDays(renderedRows);
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
    if (variant === "intraday" && sessionLayout && renderedRows.length > 0) {
      const dataStart = renderedRows[0]!.t;
      const dataEnd = renderedRows[renderedRows.length - 1]!.t;
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, renderedRows]);

  if (renderedRows.length === 0) {
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;
  }

  const ariaLabel =
    series.length === 1
      ? `${series[0]!.ticker} price over time line chart`
      : `Price comparison chart for ${series.map((entry) => entry.ticker).join(", ")}`;

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={renderedRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tickFormatter={(value: number) => formatPrice(value)}
            dx={-10}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: "0.75rem", fontSize: "0.8125rem" }}
            formatter={(value: string) => {
              const currency = currencyByTicker.get(value);
              return currency ? `${value} (${currency})` : value;
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
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
              if (typeof value !== "number") return ["—", name];
              const currency = currencyByTicker.get(name);
              const suffix = currency ? ` ${currency}` : "";
              return [`${formatPrice(value)}${suffix}`, name];
            }}
          />
          {series.map((entry) => (
            <Line
              key={entry.ticker}
              type="linear"
              dataKey={entry.ticker}
              name={entry.ticker}
              stroke={seriesColor(entry.colorIndex)}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: seriesColor(entry.colorIndex) }}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
