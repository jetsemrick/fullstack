import {
  Area,
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
import { useId, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import type { CompareChartRow, CompareSeriesMeta } from "./compareChartData";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { downsampleRows } from "./priceChartData";

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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PriceChartVariant = "daily" | "intraday";

type SingleChartProps = {
  mode: "single";
  data: GetPricesResponse;
  variant?: PriceChartVariant;
};

type CompareChartProps = {
  mode: "compare";
  rows: CompareChartRow[];
  series: CompareSeriesMeta[];
  indexed?: boolean;
  variant?: PriceChartVariant;
};

export type PriceChartProps = SingleChartProps | CompareChartProps;

function CompareTooltip({
  active,
  payload,
  label,
  variant,
  spanDays,
  indexed,
  series,
}: {
  active?: boolean;
  payload?: readonly { dataKey?: string | number; value?: unknown; color?: string }[];
  label?: unknown;
  variant: PriceChartVariant;
  spanDays: number;
  indexed: boolean;
  series: CompareSeriesMeta[];
}) {
  if (!active || !payload?.length) return null;
  const labelMs = typeof label === "number" ? label : undefined;
  const when =
    labelMs !== undefined ? formatTooltipWhen(labelMs, variant, spanDays) : "";
  const colorByTicker = new Map(series.map((s) => [s.ticker, s.color]));

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        color: "var(--fg)",
        boxShadow: "var(--shadow)",
        padding: "12px",
        fontSize: "0.875rem",
      }}
    >
      <div style={{ marginBottom: "8px", fontWeight: 600 }}>{when}</div>
      {payload.map((entry) => {
        const ticker = String(entry.dataKey ?? "");
        const raw = entry.value;
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value)) return null;
        return (
          <div key={ticker} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: colorByTicker.get(ticker) ?? entry.color,
                flexShrink: 0,
              }}
            />
            <span>{ticker}:</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {indexed ? formatIndexed(value) : formatPrice(value)}
              {indexed ? " (indexed)" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PriceChart(props: PriceChartProps) {
  const variant = props.variant ?? "daily";
  const fillGradientId = useId().replace(/:/g, "");

  const isCompare = props.mode === "compare";
  const compareRows = isCompare ? props.rows : null;
  const compareSeries = isCompare ? props.series : null;
  const indexed = isCompare ? (props.indexed ?? true) : false;

  const singleRows = useMemo(() => {
    if (props.mode !== "single") return [];
    return chartData(props.data);
  }, [props]);

  const fullRows = isCompare ? compareRows! : singleRows;
  const rows = useMemo(() => {
    if (isCompare) return fullRows;
    const singleRowsTyped = fullRows as { t: number; price: number }[];
    if (variant === "intraday") return singleRowsTyped;
    return downsampleRows(singleRowsTyped, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant, isCompare]);

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

  const yDataKey = isCompare ? compareSeries![0]!.ticker : "price";
  const yTickFormatter = isCompare && indexed ? formatIndexed : formatPrice;

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        {isCompare ? "Not enough overlapping dates for comparison." : "No data to chart."}
      </p>
    );
  }

  return (
    <div
      role="img"
      aria-label={isCompare ? "Multi-ticker comparison chart" : "Price over time line chart"}
      style={{ width: "100%", height: "100%" }}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: isCompare ? 36 : 10, right: 10, left: 0, bottom: 0 }}
        >
          {!isCompare ? (
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
          ) : null}
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
            dataKey={yDataKey}
            domain={["auto", "auto"]}
            width={60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => yTickFormatter(v)}
            dx={-10}
          />
          {isCompare ? (
            <>
              <Tooltip
                content={(props) => (
                  <CompareTooltip
                    active={props.active}
                    payload={props.payload}
                    label={props.label}
                    variant={variant}
                    spanDays={spanDays}
                    indexed={indexed}
                    series={compareSeries!}
                  />
                )}
              />
              <Legend
                verticalAlign="top"
                align="right"
                height={32}
                iconType="plainline"
                wrapperStyle={{ paddingBottom: "8px", fontSize: "12px" }}
                formatter={(value: string) => (
                  <span style={{ color: "var(--fg)", fontSize: 12 }}>{value}</span>
                )}
              />
              {compareSeries!.map((s, i) => (
                <Line
                  key={s.ticker}
                  type="monotone"
                  dataKey={s.ticker}
                  name={s.ticker}
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeDasharray={i % 2 === 1 ? "6 4" : undefined}
                  dot={false}
                  activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: s.color }}
                  isAnimationActive={false}
                />
              ))}
            </>
          ) : (
            <>
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
                formatter={(value: number | string) => [
                  typeof value === "number" ? formatPrice(value) : value,
                  "Close",
                ]}
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
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
