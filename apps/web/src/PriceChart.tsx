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
import type { ComparisonChartRow, ComparisonSeriesMeta, ComparisonValueMode } from "./priceChartData";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

type SingleSeriesRow = { t: number; price: number };

function spanCalendarDays(rows: { t: number }[]): number {
  if (rows.length < 2) return 0;
  return (rows[rows.length - 1]!.t - rows[0]!.t) / 86_400_000;
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

export function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type PriceChartVariant = "daily" | "intraday";

type SingleChartProps = {
  variant?: PriceChartVariant;
  mode: "single";
  data: GetPricesResponse;
};

type CompareChartProps = {
  variant?: PriceChartVariant;
  mode: "compare";
  rows: ComparisonChartRow[];
  seriesMeta: ComparisonSeriesMeta[];
  valueMode: ComparisonValueMode;
};

export type PriceChartProps = SingleChartProps | CompareChartProps;

type ComparisonTooltipInput = {
  active?: boolean;
  payload?: Array<{
    dataKey?: unknown;
    value?: unknown;
    payload?: unknown;
  }>;
  label?: unknown;
  variant: PriceChartVariant;
  spanDays: number;
  metaByKey: Map<string, ComparisonSeriesMeta>;
  valueMode: ComparisonValueMode;
};

function ComparisonTooltip({
  active,
  payload,
  label,
  variant,
  spanDays,
  metaByKey,
  valueMode,
}: ComparisonTooltipInput) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ComparisonChartRow | undefined;
  let ms = row?.t ?? 0;
  if (typeof label === "number" && Number.isFinite(label)) {
    ms = label;
  }

  const lines = payload
    .filter((item) => item.dataKey !== undefined && item.dataKey !== "t")
    .map((item) => {
      const dk = String(item.dataKey);
      const name = metaByKey.get(dk)?.ticker ?? dk;
      const v = item.value;
      const txt =
        v == null || typeof v !== "number" || !Number.isFinite(v)
          ? "—"
          : valueMode === "percent"
            ? `${v >= 0 ? "+" : ""}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : formatPrice(v);
      return (
        <div key={`${dk}-${name}`}>
          <span style={{ marginRight: 8, color: "var(--fg-muted)" }}>{name}</span>
          <span>{txt}</span>
        </div>
      );
    });

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
      <div style={{ marginBottom: 8 }}>{formatTooltipWhen(ms, variant, spanDays)}</div>
      {lines}
    </div>
  );
}

export function PriceChart(props: PriceChartProps) {
  const variant = props.variant ?? "daily";
  const seriesMetaForMap = props.mode === "compare" ? props.seriesMeta : [];

  const metaByKey = useMemo(() => {
    const map = new Map<string, ComparisonSeriesMeta>();
    for (const m of seriesMetaForMap) {
      map.set(m.dataKey, m);
    }
    return map;
  }, [seriesMetaForMap]);

  const singleData = props.mode === "single" ? props.data : null;
  const singleRows = useMemo((): SingleSeriesRow[] => {
    if (!singleData) return [];
    return singleData.series.map((p) => ({
      t: p.timestamp * 1000,
      price: p.close,
    }));
  }, [singleData]);

  const chartRows = props.mode === "compare" ? props.rows : singleRows;

  const anchorMs = chartRows.length > 0 ? chartRows[chartRows.length - 1]!.t : 0;

  const spanDays = spanCalendarDays(chartRows);

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

  const isComparePercent = props.mode === "compare" && props.valueMode === "percent";
  const axisLabelCompare =
    props.mode === "compare"
      ? isComparePercent
        ? variant === "intraday"
          ? "% vs first intraday bar"
          : "% vs horizon start"
        : "Close price (per symbol)"
      : "";

  if (chartRows.length === 0) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem", color: "var(--fg-muted)" }}>
        No data to chart.
      </p>
    );
  }

  const ariaCompareIndex = variant === "intraday" ? "today" : "horizon";

  return (
    <div
      role="img"
      aria-label={
        props.mode === "compare" ? `Compared price over time (${ariaCompareIndex} index)` : "Price over time line chart"
      }
      style={{ width: "100%", height: "100%" }}
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart data={chartRows as unknown[]} margin={{ top: 10, right: 10, left: 0, bottom: props.mode === "compare" ? 8 : 0 }}>
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
            width={74}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              props.mode === "compare" && props.valueMode === "percent"
                ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
                : formatPrice(v)}
            dx={-10}
            label={
              props.mode === "compare" && axisLabelCompare
                ? {
                    value: axisLabelCompare,
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--fg-muted)",
                    style: { fontSize: "11px" },
                  }
                : undefined
            }
          />
          {props.mode === "compare" ? (
            <Tooltip
              content={(tp) => (
                <ComparisonTooltip
                  active={tp.active}
                  payload={tp.payload as ComparisonTooltipInput["payload"]}
                  label={tp.label}
                  variant={variant}
                  spanDays={spanDays}
                  metaByKey={metaByKey}
                  valueMode={props.valueMode}
                />
              )}
            />
          ) : (
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
                const t = (payload?.[0]?.payload as SingleSeriesRow | undefined)?.t;
                if (typeof t === "number") {
                  return formatTooltipWhen(t, variant, spanDays);
                }
                return "";
              }}
              formatter={(value: number | string) => [
                typeof value === "number" ? formatPrice(value) : String(value),
                "Close",
              ]}
            />
          )}
          {props.mode === "compare" ? (
            <>
              <Legend
                verticalAlign="bottom"
                height={44}
                wrapperStyle={{
                  paddingTop: 12,
                  color: "var(--fg-muted)",
                  fontSize: "12px",
                }}
              />
              {props.seriesMeta.map((s) => (
                <Line
                  key={s.dataKey}
                  type="linear"
                  name={s.ticker}
                  dataKey={s.dataKey}
                  stroke={s.stroke}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: s.stroke }}
                  isAnimationActive={false}
                />
              ))}
            </>
          ) : (
            <Line
              type="linear"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, stroke: "var(--bg)", strokeWidth: 2, fill: "var(--accent)" }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
