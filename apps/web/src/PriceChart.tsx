import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

const CHART_SYNC_ID = "price-volume";
/** Matches price chart left gutter reserved by `YAxis` (price scale). */
const PRICE_AXIS_GUTTER_PX = 60;
/** Right gutter for volume axis ticks (compact). */
const VOLUME_AXIS_WIDTH_PX = 52;

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

  if (rows.length === 0)
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const priceMargins = { top: 10, right: 10, left: 0, bottom: showVolume ? 2 : 0 };
  const volumeMargins = { top: 2, right: 10, left: PRICE_AXIS_GUTTER_PX, bottom: 4 };

  const xAxisShared = {
    dataKey: "t" as const,
    type: "number" as const,
    domain: xDomain,
    scale: "time" as const,
    ticks: variant === "intraday" ? intradayTicks : undefined,
    tick: { fill: "var(--fg-muted)", fontSize: 12 },
    tickLine: false,
    axisLine: false,
    tickFormatter,
    minTickGap: variant === "intraday" ? 0 : 32,
  };

  const ariaLabel = showVolume ? "Stock price line chart with trading volume bars below" : "Price over time line chart";

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ flex: showVolume ? "3 1 0" : "1 1 auto", minHeight: showVolume ? 200 : 280 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={showVolume ? 200 : 320}>
          <LineChart data={rows} syncId={CHART_SYNC_ID} margin={priceMargins}>
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              {...xAxisShared}
              tick={showVolume ? false : xAxisShared.tick}
              height={showVolume ? 8 : undefined}
              dy={showVolume ? 0 : 10}
            />
            <YAxis
              dataKey="price"
              domain={["auto", "auto"]}
              width={PRICE_AXIS_GUTTER_PX}
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
                const t = (payload?.[0]?.payload as PriceVolumeRow | undefined)?.t;
                if (typeof t === "number") {
                  return formatTooltipWhen(t, variant, spanDays);
                }
                return "";
              }}
              formatter={(value: number | string) => [typeof value === "number" ? formatPrice(value) : value, "Close"]}
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
        <div style={{ flex: "1 1 0", minHeight: 96 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={96}>
            <BarChart data={rows} syncId={CHART_SYNC_ID} margin={volumeMargins} barCategoryGap={1}>
              <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis {...xAxisShared} dy={10} />
              <YAxis
                yAxisId="vol"
                orientation="right"
                width={VOLUME_AXIS_WIDTH_PX}
                tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatVolumeAxis(v)}
                dx={6}
                domain={[0, "auto"]}
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
                  const row = (payload as ReadonlyArray<{ payload?: PriceVolumeRow }> | undefined)?.[0]?.payload;
                  if (row && typeof row.t === "number") {
                    return formatTooltipWhen(row.t, variant, spanDays);
                  }
                  return "";
                }}
                formatter={(_value, _name, item) => {
                  const row = (item as { payload: PriceVolumeRow }).payload;
                  return [formatVolumeTooltip(row.volume), "Volume"];
                }}
              />
              <Bar dataKey="volumeBar" yAxisId="vol" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {rows.map((entry, i) => (
                  <Cell
                    key={`v-${entry.t}-${i}`}
                    fill="var(--fg-muted)"
                    fillOpacity={entry.volume == null ? 0 : 0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
