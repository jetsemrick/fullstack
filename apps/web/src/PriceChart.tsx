import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import {
  buildChartRowsWithEma,
  formatCrossoverLabel,
  type ChartRowWithEma,
  type EmaCrossover,
} from "./ema";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

const chartData = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    ema50: null as number | null,
    ema200: null as number | null,
    crossover: null as ChartRowWithEma["crossover"],
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

export type PriceChartVariant = "daily" | "intraday";

export interface PriceChartProps {
  data: GetPricesResponse;
  variant?: PriceChartVariant;
  /** Longer daily history used to warm EMA200 before the visible window. */
  emaSource?: GetPricesResponse | null;
  onCrossoversReady?: (crossovers: EmaCrossover[]) => void;
}

export function PriceChart({
  data,
  variant = "daily",
  emaSource = null,
  onCrossoversReady,
}: PriceChartProps) {
  const showEma = variant === "daily";

  const { rows, crossovers } = useMemo(() => {
    if (!showEma) {
      return { rows: chartData(data), crossovers: [] as EmaCrossover[] };
    }
    return buildChartRowsWithEma(data, emaSource ?? data);
  }, [data, emaSource, showEma]);

  useEffect(() => {
    onCrossoversReady?.(crossovers);
  }, [crossovers, onCrossoversReady]);

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

  const crossoverDots = useMemo(() => {
    if (!showEma) return [];
    return crossovers
      .map((c) => {
        const row = rows.find((r) => r.t === c.timestamp * 1000);
        if (!row) return null;
        const y = row.ema50 ?? row.ema200 ?? row.price;
        return { ...c, x: row.t, y };
      })
      .filter((d): d is EmaCrossover & { x: number; y: number } => d != null);
  }, [crossovers, rows, showEma]);

  const hasEmaLines = showEma && rows.some((r) => r.ema50 != null && r.ema200 != null);

  if (rows.length === 0) {
    return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;
  }

  return (
    <div className="price-chart-wrap">
      {showEma && (
        <div className="chart-legend" aria-label="Chart legend">
          <span className="chart-legend__item">
            <span className="chart-legend__swatch chart-legend__swatch--close" aria-hidden />
            Close
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__swatch chart-legend__swatch--ema50" aria-hidden />
            EMA 50
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__swatch chart-legend__swatch--ema200" aria-hidden />
            EMA 200
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__swatch chart-legend__swatch--golden" aria-hidden />
            Golden cross
          </span>
          <span className="chart-legend__item">
            <span className="chart-legend__swatch chart-legend__swatch--death" aria-hidden />
            Death cross
          </span>
        </div>
      )}
      <div
        role="img"
        aria-label={showEma ? "Price and EMA crossover chart" : "Price over time line chart"}
        className="price-chart-canvas"
      >
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
              domain={["auto", "auto"]}
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
                const row = payload?.[0]?.payload as ChartRowWithEma | undefined;
                if (row && typeof row.t === "number") {
                  return formatTooltipWhen(row.t, variant, spanDays);
                }
                return "";
              }}
              formatter={(value: number | string, name: string) => {
                const label =
                  name === "price"
                    ? "Close"
                    : name === "ema50"
                      ? "EMA 50"
                      : name === "ema200"
                        ? "EMA 200"
                        : name;
                return [typeof value === "number" ? formatPrice(value) : value, label];
              }}
            />
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
            {hasEmaLines && (
              <>
                <Line
                  yAxisId="price"
                  type="linear"
                  dataKey="ema50"
                  stroke="var(--ema50)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="price"
                  type="linear"
                  dataKey="ema200"
                  stroke="var(--ema200)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </>
            )}
            {crossoverDots.map((c) => (
              <ReferenceDot
                key={`${c.type}-${c.timestamp}`}
                x={c.x}
                y={c.y}
                yAxisId="price"
                r={7}
                fill={c.type === "golden" ? "var(--cross-golden)" : "var(--cross-death)"}
                stroke="var(--bg)"
                strokeWidth={2}
                aria-label={formatCrossoverLabel(c.type)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showEma && !hasEmaLines && (
        <p className="chart-ema-hint muted">
          EMA 50 / EMA 200 need more daily history (200+ trading days). Try 5 Year or All Time.
        </p>
      )}
    </div>
  );
}
