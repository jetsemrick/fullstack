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
import type { GetPricesResponse } from "@stock/shared";

type ChartRow = {
  t: number;
  price: number;
  /** Shares traded for the day; null when upstream omits volume */
  volume: number | null;
  /** Non-null volume for bars; 0 when unknown so the series stays numeric */
  volumeBar: number;
};

const chartData = (data: GetPricesResponse): ChartRow[] =>
  data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    volume: p.volume,
    volumeBar: p.volume != null && p.volume > 0 ? p.volume : 0,
  }));

function formatAxisDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div
      className="chart-tooltip"
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
        color: "var(--fg)",
        padding: "0.65rem 0.75rem",
        fontSize: "0.8125rem",
        lineHeight: 1.45,
      }}
    >
      <div className="tabular" style={{ marginBottom: "0.35rem", color: "var(--fg-muted)" }}>
        {new Date(row.t).toLocaleString()}
      </div>
      <div className="tabular">
        <strong>Close</strong> {formatPrice(row.price)}
      </div>
      <div className="tabular">
        <strong>Volume</strong>{" "}
        {row.volume == null ? "—" : `${formatVolume(row.volume)} shares`}
      </div>
    </div>
  );
}

export function PriceChart({ data }: { data: GetPricesResponse }) {
  const rows = chartData(data);
  if (rows.length === 0) return <p className="muted">No data to chart.</p>;

  const hasAnyVolume = rows.some((r) => r.volume != null && r.volume > 0);

  return (
    <div
      className="chart-wrap"
      role="img"
      aria-label="Price and daily trading volume over time"
    >
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            yAxisId="price"
            dataKey="price"
            domain={["auto", "auto"]}
            width={64}
            tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatPrice(v)}
          />
          {hasAnyVolume ? (
            <YAxis
              yAxisId="volume"
              orientation="right"
              dataKey="volumeBar"
              width={52}
              domain={[0, "auto"]}
              tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatVolume(v)}
            />
          ) : null}
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--card-border)", strokeWidth: 1 }} />
          {hasAnyVolume ? (
            <Bar
              yAxisId="volume"
              dataKey="volumeBar"
              fill="var(--fg-muted)"
              fillOpacity={0.28}
              isAnimationActive={false}
              name="Volume"
            />
          ) : null}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="price"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--accent)", fill: "var(--bg)" }}
            isAnimationActive={false}
            name="Close"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
