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
import type { GetPricesResponse } from "@stock/shared";
import type { MergedChartRow } from "./mergeChartSeries";

/** Distinct strokes for up to 5 series; meets contrast on light background. */
const SERIES_STROKES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const chartDataSingle = (data: GetPricesResponse) =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
  }));

function formatAxisDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIndexed(n: number): string {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export type PriceChartProps =
  | { mode: "single"; data: GetPricesResponse }
  | { mode: "compare"; rows: MergedChartRow[]; tickers: string[] };

export function PriceChart(props: PriceChartProps) {
  if (props.mode === "single") {
    const rows = chartDataSingle(props.data);
    if (rows.length === 0) return <p className="muted">No data to chart.</p>;

    return (
      <div className="chart-wrap" role="img" aria-label="Price over time line chart">
        <ResponsiveContainer width="100%" height="100%" minHeight={320}>
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(38,37,30,0.08)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--card-border)" }}
              tickFormatter={(ms: number) => formatAxisDate(ms)}
              minTickGap={24}
            />
            <YAxis
              dataKey="price"
              domain={["auto", "auto"]}
              width={64}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatPrice(v)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: `1px solid var(--card-border)`,
                borderRadius: 8,
                color: "var(--fg)",
              }}
              labelFormatter={(_, payload) => {
                const t = (payload?.[0]?.payload as { t?: number })?.t;
                if (typeof t === "number") {
                  return new Date(t).toLocaleString();
                }
                return "";
              }}
              formatter={(value: number | string) => [
                typeof value === "number" ? formatPrice(value) : value,
                "Close",
              ]}
            />
            <Line
              type="monotone"
              dataKey="price"
              name={props.data.ticker}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--accent)", fill: "var(--bg)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const { rows, tickers } = props;
  if (rows.length === 0 || tickers.length === 0) {
    return <p className="muted">No overlapping dates to chart.</p>;
  }

  return (
    <div className="chart-wrap" role="img" aria-label="Indexed price comparison chart">
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(38,37,30,0.08)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--card-border)" }}
            tickFormatter={(ms: number) => formatAxisDate(ms)}
            minTickGap={24}
          />
          <YAxis
            domain={["auto", "auto"]}
            width={56}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            label={{ value: "Indexed %", angle: -90, position: "insideLeft", fill: "var(--fg-muted)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: `1px solid var(--card-border)`,
              borderRadius: 8,
              color: "var(--fg)",
            }}
            labelFormatter={(_, payload) => {
              const t = (payload?.[0]?.payload as { t?: number })?.t;
              if (typeof t === "number") {
                return new Date(t).toLocaleString();
              }
              return "";
            }}
            formatter={(value: number | string, name: string) => {
              if (typeof value !== "number" || !Number.isFinite(value)) {
                return ["—", name];
              }
              return [formatIndexed(value), name];
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 4 }}
            formatter={(value) => <span style={{ color: "var(--fg)" }}>{value}</span>}
          />
          {tickers.map((sym, i) => (
            <Line
              key={sym}
              type="monotone"
              dataKey={sym}
              name={sym}
              stroke={SERIES_STROKES[i % SERIES_STROKES.length]}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, stroke: SERIES_STROKES[i % SERIES_STROKES.length], fill: "var(--bg)" }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
