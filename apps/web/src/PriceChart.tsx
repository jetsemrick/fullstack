import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import { buildOhlcChartRows, downsampleOhlcRows, downsampleRows, formatVolumeTooltip, type OhlcChartRow } from "./priceChartData";

const MAX_DAILY_RENDER_POINTS = 1_200;
const CANDLE_UP_COLOR = "#2b703e";
const CANDLE_DOWN_COLOR = "#ba3b3b";

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
export type PriceChartType = "line" | "candlestick";

export function PriceChart({
  data,
  variant = "daily",
  chartType = "line",
}: {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  chartType?: PriceChartType;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const fullRows = useMemo(() => buildOhlcChartRows(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    if (chartType === "candlestick") return downsampleOhlcRows(fullRows, MAX_DAILY_RENDER_POINTS);
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [chartType, fullRows, variant]);
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
      // Anchor left to first bar so pre-market domain padding does not leave empty chart space.
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartType === "line") return ["auto", "auto"];
    if (rows.length === 0) return ["auto", "auto"];
    const low = Math.min(...rows.map((row) => row.low));
    const high = Math.max(...rows.map((row) => row.high));
    const padding = Math.max((high - low) * 0.04, high * 0.002, 0.01);
    return [low - padding, high + padding];
  }, [chartType, rows]);

  const candleBodyWidth = useMemo(() => Math.max(2, Math.min(10, 760 / rows.length)), [rows.length]);

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div
      role="img"
      aria-label={chartType === "candlestick" ? "Price over time candlestick chart" : "Price over time line chart"}
      style={{ width: "100%", height: "100%" }}
    >
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
            domain={yDomain}
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
            content={chartType === "candlestick" ? (props) => <CandlestickTooltip {...props} variant={variant} spanDays={spanDays} /> : undefined}
            formatter={(value: number | string) => [typeof value === "number" ? formatPrice(value) : value, "Close"]}
          />
          {chartType === "candlestick" ? (
            <>
              <Bar dataKey="wickRange" barSize={1} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={`wick-${row.t}`} fill={row.isUp ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR} />
                ))}
              </Bar>
              <Bar dataKey="bodyRange" barSize={candleBodyWidth} minPointSize={2} isAnimationActive={false}>
                {rows.map((row) => (
                  <Cell key={`body-${row.t}`} fill={row.isUp ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR} />
                ))}
              </Bar>
            </>
          ) : (
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
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CandlestickTooltip({
  active,
  payload,
  variant,
  spanDays,
}: {
  active?: boolean;
  payload?: Array<{ payload?: OhlcChartRow }>;
  variant: PriceChartVariant;
  spanDays: number;
}) {
  const row = payload?.find((item) => item.payload)?.payload;
  if (!active || !row) return null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        color: "var(--fg)",
        boxShadow: "var(--shadow)",
        padding: "12px",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{formatTooltipWhen(row.t, variant, spanDays)}</div>
      <TooltipRow label="Open" value={formatPrice(row.open)} />
      <TooltipRow label="High" value={formatPrice(row.high)} />
      <TooltipRow label="Low" value={formatPrice(row.low)} />
      <TooltipRow label="Close" value={formatPrice(row.close)} />
      <TooltipRow label="Volume" value={formatVolumeTooltip(row.volume)} />
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", fontSize: "0.85rem" }}>
      <span style={{ color: "var(--fg-muted)" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
