import {
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
import {
  buildCompareChartRows,
  compareCloseKey,
  compareValueKey,
  type CompareChartSeriesInput,
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

type TooltipItem = {
  dataKey?: string | number;
  payload?: Record<string, number | undefined>;
};

export function PriceChart({
  data,
  series,
  variant = "daily",
}: {
  data?: GetPricesResponse;
  series?: CompareChartSeriesInput[];
  variant?: PriceChartVariant;
}) {
  const chartSeries = useMemo<CompareChartSeriesInput[]>(() => {
    if (series) return series;
    if (!data) return [];
    return [{ id: "series0", ticker: data.ticker, color: "var(--accent)", data }];
  }, [data, series]);
  const compareMode = chartSeries.length > 1;
  const { rows, series: seriesMeta } = useMemo(
    () => buildCompareChartRows(chartSeries, { normalizeToFirstClose: compareMode }),
    [chartSeries, compareMode],
  );
  const metaByValueKey = useMemo(
    () => new Map(seriesMeta.map((item) => [compareValueKey(item.id), item])),
    [seriesMeta],
  );
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
    <div
      role="img"
      aria-label="Price over time line chart"
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      {seriesMeta.length > 1 && (
        <ul className="chart-legend" aria-label="Compared tickers">
          {seriesMeta.map((item) => (
            <li key={item.id} className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ backgroundColor: item.color }} />
              <span>{item.ticker}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
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
            width={60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (compareMode ? v.toFixed(0) : formatPrice(v))}
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
            formatter={(value: number | string, name, item) => {
              if (typeof value !== "number") return [value, name];
              const tooltipItem = item as TooltipItem;
              const meta = tooltipItem.dataKey ? metaByValueKey.get(String(tooltipItem.dataKey)) : undefined;
              if (!meta) return [formatPrice(value), name];
              const close = tooltipItem.payload?.[compareCloseKey(meta.id)];
              const formattedClose = typeof close === "number" ? formatPrice(close) : "—";
              const formattedValue = compareMode
                ? `${value.toFixed(2)} index (${formattedClose}${meta.currency ? ` ${meta.currency}` : ""})`
                : `${formattedClose}${meta.currency ? ` ${meta.currency}` : ""}`;
              return [formattedValue, meta.ticker];
            }}
          />
          {seriesMeta.map((item) => (
            <Line
              key={item.id}
              type="linear"
              dataKey={compareValueKey(item.id)}
              name={item.ticker}
              stroke={item.color}
              strokeWidth={3}
              dot={false}
              connectNulls
              activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: item.color }}
              isAnimationActive={false}
            />
          ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
