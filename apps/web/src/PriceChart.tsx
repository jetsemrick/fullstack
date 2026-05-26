import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";
import {
  buildPriceVolumeRows,
  formatVolumeAxis,
  formatVolumeTooltip,
  seriesHasVolume,
  type PriceVolumeRow,
} from "./priceChartData";

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

// Shared layout constants so the price and volume X-axes align pixel-perfectly.
const CHART_MARGIN = { top: 10, right: 10, left: 0, bottom: 0 } as const;
const Y_AXIS_WIDTH = 60;
const SYNC_ID = "price-volume";

export function PriceChart({ data, variant = "daily" }: { data: GetPricesResponse; variant?: PriceChartVariant }) {
  const rows: PriceVolumeRow[] = useMemo(() => buildPriceVolumeRows(data), [data]);
  const showVolume = useMemo(() => seriesHasVolume(data.series), [data.series]);
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

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        No data to chart.
      </p>
    );
  }

  const tooltipContentStyle = {
    background: "var(--card)",
    border: `1px solid var(--card-border)`,
    borderRadius: "12px",
    color: "var(--fg)",
    boxShadow: "var(--shadow)",
    padding: "12px",
  } as const;

  const ariaLabel = showVolume
    ? "Price over time line chart with trading volume bars"
    : "Price over time line chart";

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: showVolume ? "1 1 75%" : "1 1 100%", minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={showVolume ? 220 : 320}>
          <LineChart data={rows} margin={CHART_MARGIN} syncId={showVolume ? SYNC_ID : undefined}>
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={xDomain}
              scale="time"
              ticks={variant === "intraday" ? intradayTicks : undefined}
              tick={showVolume ? false : { fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={tickFormatter}
              minTickGap={variant === "intraday" ? 0 : 32}
              dy={10}
              height={showVolume ? 0 : 30}
              hide={showVolume}
            />
            <YAxis
              dataKey="price"
              domain={["auto", "auto"]}
              width={Y_AXIS_WIDTH}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatPrice(v)}
              dx={-10}
            />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelFormatter={(_, payload) => {
                const t = (payload?.[0]?.payload as { t?: number })?.t;
                if (typeof t === "number") {
                  return formatTooltipWhen(t, variant, spanDays);
                }
                return "";
              }}
              formatter={(value: number | string) => [
                typeof value === "number" ? formatPrice(value) : value,
                "Close",
              ]}
            />
            <Line
              type="linear"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: "var(--accent)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showVolume && (
        <div style={{ flex: "1 1 25%", minHeight: 110, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              paddingLeft: Y_AXIS_WIDTH,
              fontSize: 11,
              color: "var(--fg-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 2,
            }}
          >
            Volume
          </div>
          <ResponsiveContainer width="100%" height="100%" minHeight={90}>
            <BarChart data={rows} margin={CHART_MARGIN} syncId={SYNC_ID}>
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
                dataKey="volumeBar"
                domain={[0, "auto"]}
                width={Y_AXIS_WIDTH}
                tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatVolumeAxis(v)}
                tickCount={3}
                dx={-10}
              />
              <Tooltip
                cursor={{ fill: "var(--card-border)", opacity: 0.4 }}
                contentStyle={tooltipContentStyle}
                labelFormatter={(_, payload) => {
                  const t = (payload?.[0]?.payload as { t?: number })?.t;
                  if (typeof t === "number") {
                    return formatTooltipWhen(t, variant, spanDays);
                  }
                  return "";
                }}
                formatter={(_value, _name, item) => {
                  const v = (item?.payload as { volume?: number | null })?.volume ?? null;
                  return [formatVolumeTooltip(v), "Volume"];
                }}
              />
              <Bar
                dataKey="volumeBar"
                fill="var(--fg-muted)"
                fillOpacity={0.55}
                isAnimationActive={false}
                maxBarSize={variant === "intraday" ? 6 : 12}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
