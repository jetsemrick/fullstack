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
import type { AlignedCompareRow, CompareNormalization, GetPricesResponse } from "@stock/shared";
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

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIndexed(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function downsampleCompareRows(rows: AlignedCompareRow[], maxRows: number): AlignedCompareRow[] {
  if (rows.length <= maxRows) return rows;

  const result: AlignedCompareRow[] = [rows[0]!];
  const innerSlots = maxRows - 2;
  const step = (rows.length - 2) / innerSlots;

  for (let slot = 1; slot <= innerSlots; slot++) {
    const index = Math.min(rows.length - 2, Math.round(slot * step));
    result.push(rows[index]!);
  }

  result.push(rows[rows.length - 1]!);
  return result;
}

export type PriceChartVariant = "daily" | "intraday";

export type CompareSeriesMeta = {
  ticker: string;
  color: string;
};

type SingleChartProps = {
  mode?: "single";
  data: GetPricesResponse;
  variant?: PriceChartVariant;
};

type CompareChartProps = {
  mode: "compare";
  rows: AlignedCompareRow[];
  series: CompareSeriesMeta[];
  normalization: CompareNormalization;
  variant?: PriceChartVariant;
};

export type PriceChartProps = SingleChartProps | CompareChartProps;

type CompareTooltipPayload = readonly {
  dataKey?: string | number;
  value?: unknown;
  color?: string;
  payload?: { t?: number };
}[];

function CompareTooltip({
  active,
  payload,
  variant,
  spanDays,
  normalization,
  series,
}: {
  active?: boolean;
  payload?: CompareTooltipPayload;
  variant: PriceChartVariant;
  spanDays: number;
  normalization: CompareNormalization;
  series: CompareSeriesMeta[];
}) {
  if (!active || !payload?.length) return null;

  const t = payload[0]?.payload?.t;
  if (typeof t !== "number") return null;

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
      }}
    >
      <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>
        {formatTooltipWhen(t, variant, spanDays)}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {payload.map((entry) => {
          const ticker = String(entry.dataKey ?? "");
          const rawValue = entry.value;
          const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
          if (!Number.isFinite(value)) return null;
          const color = colorByTicker.get(ticker) ?? entry.color ?? "var(--fg)";
          return (
            <li key={ticker} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>{ticker}</span>
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {normalization === "indexed" ? formatIndexed(value) : formatPrice(value)}
                {normalization === "indexed" ? "" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SinglePriceChart({ data, variant = "daily" }: { data: GetPricesResponse; variant?: PriceChartVariant }) {
  const fillGradientId = useId().replace(/:/g, "");
  const fullRows = useMemo(() => chartData(data), [data]);
  const rows = useMemo(() => {
    if (variant === "intraday") return fullRows;
    return downsampleRows(fullRows, MAX_DAILY_RENDER_POINTS);
  }, [fullRows, variant]);
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

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  return (
    <div role="img" aria-label="Price over time line chart" style={{ width: "100%", height: "100%" }}>
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
              const t = (payload?.[0]?.payload as { t?: number })?.t;
              if (typeof t === "number") {
                return formatTooltipWhen(t, variant, spanDays);
              }
              return "";
            }}
            formatter={(value: number | string) => [typeof value === "number" ? formatPrice(value) : value, "Close"]}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MultiTickerPriceChart({
  rows,
  series,
  normalization,
  variant = "daily",
}: {
  rows: AlignedCompareRow[];
  series: CompareSeriesMeta[];
  normalization: CompareNormalization;
  variant?: PriceChartVariant;
}) {
  const sampledRows = useMemo(() => {
    if (variant === "intraday") return rows;
    return downsampleCompareRows(rows, MAX_DAILY_RENDER_POINTS);
  }, [rows, variant]);

  const spanDays = spanCalendarDays(sampledRows);
  const tickFormatter =
    variant === "intraday"
      ? (ms: number) => formatIntradayAxisTick(ms)
      : (ms: number) => formatDailyAxisTick(ms, spanDays);

  const yTickFormatter = normalization === "indexed"
    ? (v: number) => formatIndexed(v)
    : (v: number) => formatPrice(v);

  if (sampledRows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        No overlapping dates to compare. Try a different time range.
      </p>
    );
  }

  const ariaLabel = `Compare chart for ${series.map((s) => s.ticker).join(", ")}`;

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={sampledRows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            minTickGap={32}
            dy={10}
          />
          <YAxis
            domain={["auto", "auto"]}
            width={60}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yTickFormatter}
            dx={-10}
          />
          <Tooltip
            content={(tooltipProps) => (
              <CompareTooltip
                active={tooltipProps.active}
                payload={tooltipProps.payload as CompareTooltipPayload | undefined}
                variant={variant}
                spanDays={spanDays}
                normalization={normalization}
                series={series}
              />
            )}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: "0.5rem", fontSize: "0.8125rem" }}
            formatter={(value: string) => (
              <span style={{ color: "var(--fg)" }}>{value}</span>
            )}
          />
          {series.map(({ ticker, color }) => (
            <Line
              key={ticker}
              type="linear"
              dataKey={ticker}
              name={ticker}
              stroke={color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: color }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PriceChart(props: PriceChartProps) {
  if (props.mode === "compare") {
    return (
      <MultiTickerPriceChart
        rows={props.rows}
        series={props.series}
        normalization={props.normalization}
        variant={props.variant}
      />
    );
  }
  return <SinglePriceChart data={props.data} variant={props.variant} />;
}
