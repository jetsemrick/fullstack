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
import type { ChartSeriesMeta, MultiChartRow } from "./priceChartData";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";

function spanCalendarDays(rows: MultiChartRow[]): number {
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
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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

type TooltipEntry = {
  dataKey?: string;
  value?: number | null;
  color?: string;
  payload?: MultiChartRow;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
  series: ChartSeriesMeta[];
  variant: PriceChartVariant;
  spanDays: number;
};

function MultiSeriesTooltip({ active, payload, series, variant, spanDays }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const t = payload[0]?.payload?.t;
  if (typeof t !== "number") return null;

  return (
    <div
      className="chart-tooltip"
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        color: "var(--fg)",
        boxShadow: "var(--shadow)",
        padding: "12px",
      }}
    >
      <div className="chart-tooltip__when">{formatTooltipWhen(t, variant, spanDays)}</div>
      <ul className="chart-tooltip__list">
        {series.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.ticker);
          const value = entry?.value;
          return (
            <li key={s.ticker} className="chart-tooltip__row">
              <span className="chart-tooltip__swatch" style={{ background: s.color }} aria-hidden />
              <span className="chart-tooltip__label">{s.ticker}</span>
              <span className="chart-tooltip__value">
                {typeof value === "number" ? formatPrice(value) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PriceChart({
  rows,
  series,
  variant = "daily",
}: {
  rows: MultiChartRow[];
  series: ChartSeriesMeta[];
  variant?: PriceChartVariant;
}) {
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
      const dataStart = rows[0]!.t;
      const dataEnd = rows[rows.length - 1]!.t;
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const ariaLabel =
    series.length > 0
      ? `Absolute price comparison chart for ${series.map((s) => s.ticker).join(", ")}`
      : "Price comparison chart";

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        No data to chart.
      </p>
    );
  }

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            tickFormatter={(v: number) => formatPrice(v)}
            dx={-10}
          />
          <Tooltip
            content={(props) => (
              <MultiSeriesTooltip
                active={props.active}
                payload={props.payload as TooltipProps["payload"]}
                label={props.label as number | undefined}
                series={series}
                variant={variant}
                spanDays={spanDays}
              />
            )}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            formatter={(value: string) => (
              <span style={{ color: "var(--fg)" }}>{value}</span>
            )}
          />
          {series.map((s) => (
            <Line
              key={s.ticker}
              type="linear"
              dataKey={s.ticker}
              name={s.ticker}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: s.color }}
              isAnimationActive={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
