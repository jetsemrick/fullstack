import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { ComparisonRow } from "./priceChartData";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

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

function formatPercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export type PriceChartVariant = "daily" | "intraday";

export type CompareSeriesConfig = {
  ticker: string;
  color: string;
};

export function PriceChart({
  rows,
  series,
  normalized = true,
  variant = "daily",
}: {
  rows: ComparisonRow[];
  series: CompareSeriesConfig[];
  normalized?: boolean;
  variant?: PriceChartVariant;
}) {
  const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;
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

  const seriesLabel = series.map((s) => s.ticker).join(", ");
  const ariaLabel =
    series.length > 1
      ? `Price comparison chart for ${seriesLabel}, percent change from horizon start`
      : `Price chart for ${series[0]?.ticker ?? "symbol"}`;

  if (rows.length === 0) {
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            domain={["auto", "auto"]}
            width={normalized ? 56 : 60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (normalized ? formatPercent(v) : formatPrice(v))}
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
              if (typeof value !== "number") return [value, name];
              return [normalized ? formatPercent(value) : formatPrice(value), name];
            }}
          />
          {series.length > 1 && (
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.ticker}
              type="linear"
              dataKey={s.ticker}
              name={s.ticker}
              stroke={s.color}
              strokeWidth={3}
              dot={false}
              connectNulls
              activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
