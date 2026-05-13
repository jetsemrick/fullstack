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
import {
  buildPriceVolumeRows,
  formatVolumeAxis,
  formatVolumeTooltip,
  seriesHasVolume,
  type PriceVolumeRow,
} from "./priceChartData";
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

export type PriceChartVariant = "daily" | "intraday";

/** Stretch volume scale so bars sit in the lower ~28% of the chart area (dual-axis readability). */
function volumeAxisDomainMax(max: number): number {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  return m * 3.5;
}

function PriceVolumeTooltipBody({
  active,
  payload,
  variant,
  spanDays,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | string | ReadonlyArray<number | string>; payload?: unknown }>;
  variant: PriceChartVariant;
  spanDays: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as PriceVolumeRow | undefined;
  if (!row || typeof row.t !== "number") return null;

  let closeStr = "";
  let volStr: string | null = null;
  for (const p of payload) {
    const key = p.dataKey != null ? String(p.dataKey) : "";
    if (key === "price") {
      const v = p.value;
      closeStr = typeof v === "number" ? formatPrice(v) : "";
    }
    if (key === "volumeBar") {
      volStr = formatVolumeTooltip(row.volume);
    }
  }

  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid var(--card-border)`,
        borderRadius: "12px",
        color: "var(--fg)",
        boxShadow: "var(--shadow)",
        padding: "12px",
      }}
    >
      <div style={{ marginBottom: "8px", fontWeight: 600 }}>{formatTooltipWhen(row.t, variant, spanDays)}</div>
      <div style={{ fontSize: 13 }}>Close: {closeStr}</div>
      {volStr != null && (
        <div style={{ fontSize: 13 }}>Volume: {volStr}</div>
      )}
    </div>
  );
}


export function PriceChart({ data, variant = "daily" }: { data: GetPricesResponse; variant?: PriceChartVariant }) {
  const rows = buildPriceVolumeRows(data);
  const showVolume = seriesHasVolume(data.series);
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

  const chartMargin = { top: 10, right: showVolume ? 52 : 10, left: 0, bottom: 0 };

  return (
    <div role="img" aria-label="Price and volume over time" style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={chartMargin}>
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
          {showVolume && (
            <YAxis
              yAxisId="volume"
              orientation="right"
              dataKey="volumeBar"
              domain={[0, volumeAxisDomainMax]}
              width={48}
              tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatVolumeAxis(v)}
              dx={8}
              allowDataOverflow={false}
            />
          )}
          <Tooltip
            content={(props) => (
              <PriceVolumeTooltipBody
                active={props.active}
                payload={props.payload}
                variant={variant}
                spanDays={spanDays}
              />
            )}
          />
          {showVolume && (
            <Bar
              yAxisId="volume"
              dataKey="volumeBar"
              fill="var(--fg-muted)"
              fillOpacity={0.25}
              isAnimationActive={false}
              maxBarSize={variant === "intraday" ? 6 : 4}
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
