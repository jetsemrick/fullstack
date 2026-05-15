import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";
import { buildPriceVolumeRows, formatVolumeAxis, formatVolumeTooltip, seriesHasVolume } from "./priceChartData";

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
  const rows = buildPriceVolumeRows(data);
  const hasVolume = seriesHasVolume(data.series);
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

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div role="img" aria-label={hasVolume ? "Price and volume over time chart" : "Price over time line chart"} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: hasVolume ? 6 : 10, left: 0, bottom: 0 }}>
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
            dataKey="price"
            domain={["auto", "auto"]}
            width={60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatPrice(v)}
            dx={-10}
          />
          {hasVolume && (
            <YAxis
              yAxisId="volume"
              orientation="right"
              dataKey="volume"
              domain={[0, "dataMax"]}
              width={52}
              tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatVolumeAxis(v)}
            />
          )}
          <Tooltip<number | string, string>
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
            formatter={(value, name) => {
              if (name === "volume") {
                return [typeof value === "number" ? formatVolumeTooltip(value) : formatVolumeTooltip(null), "Volume"];
              }
              return [typeof value === "number" ? formatPrice(value) : value, "Close"];
            }}
          />
          {hasVolume && (
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="var(--fg-muted)"
              fillOpacity={0.22}
              maxBarSize={10}
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="price"
            type="linear"
            dataKey="price"
            stroke="var(--accent)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: "var(--accent)" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
