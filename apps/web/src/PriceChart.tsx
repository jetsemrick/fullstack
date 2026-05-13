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
import type { GetPricesResponse } from "@stock/shared";
import { alignSeriesByTimestamp } from "./compareSeries";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

type ChartRow = {
  t: number;
  timestamp: number;
  primaryClose: number | null;
  secondaryClose: number | null;
};

function singleSeriesRows(data: GetPricesResponse): ChartRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    timestamp: p.timestamp,
    primaryClose: p.close,
    secondaryClose: null,
  }));
}

function spanCalendarDays(rows: { t: number }[]): number {
  if (rows.length < 2) return 0;
  return (rows[rows.length - 1]!.t - rows[0]!.t) / 86_400_000;
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

function formatTooltipWhen(ms: number, variant: "daily" | "intraday", spanDays: number): string {
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
  primary: GetPricesResponse;
  /** When loaded, draws a second series aligned by timestamp against `primary`. */
  secondary?: GetPricesResponse | null;
  variant?: PriceChartVariant;
};

export function PriceChart({ primary, secondary, variant = "daily" }: PriceChartProps) {
  const isCompare =
    secondary != null && secondary.series.length > 0 && secondary.ticker !== primary.ticker;

  const rows: ChartRow[] = useMemo(() => {
    if (!isCompare) return singleSeriesRows(primary);
    return alignSeriesByTimestamp(primary, secondary!);
  }, [isCompare, primary, secondary]);

  const anchorMs = useMemo(() => {
    const last = primary.series[primary.series.length - 1]?.timestamp;
    return last != null ? last * 1000 : 0;
  }, [primary.series]);

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

  const ariaLabel = isCompare
    ? `Price comparison line chart for ${primary.ticker} and ${secondary!.ticker}`
    : `Price over time line chart for ${primary.ticker}`;

  const primaryTicker = primary.ticker;
  const secondaryTicker = isCompare ? secondary!.ticker : "";

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
            yAxisId="price"
            width={72}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatPrice(v)}
            dx={-10}
            domain={["auto", "auto"]}
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
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as ChartRow | undefined;
              const tMs = typeof row?.t === "number" ? row.t : NaN;
              if (!Number.isFinite(tMs)) return null;
              const label = formatTooltipWhen(tMs, variant, spanDays);
              const parts: { key: string; val: string }[] = [];
              if (row && row.primaryClose != null) {
                parts.push({ key: primaryTicker, val: formatPrice(row.primaryClose) });
              }
              if (isCompare && row && row.secondaryClose != null) {
                parts.push({ key: secondaryTicker, val: formatPrice(row.secondaryClose) });
              }
              return (
                <div className="recharts-default-tooltip">
                  <p style={{ margin: "0 0 8px" }}>{label}</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {parts.map((p) => (
                      <li key={p.key} style={{ fontVariantNumeric: "tabular-nums" }}>
                        <strong>{p.key}:</strong> {p.val}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          />
          {isCompare && <Legend verticalAlign="top" align="right" height={28} iconType="circle" />}
          <Line
            name={primaryTicker}
            type="linear"
            yAxisId="price"
            dataKey="primaryClose"
            stroke="var(--accent)"
            strokeWidth={3}
            dot={false}
            connectNulls={false}
            activeDot={{
              r: 6,
              stroke: "var(--bg)",
              strokeWidth: 2,
              fill: "var(--accent)",
            }}
            isAnimationActive={false}
          />
          {isCompare && (
            <Line
              name={secondaryTicker}
              type="linear"
              yAxisId="price"
              dataKey="secondaryClose"
              stroke="var(--chart-compare)"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              activeDot={{
                r: 6,
                stroke: "var(--bg)",
                strokeWidth: 2,
                fill: "var(--chart-compare)",
              }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
