import type { ReactElement } from "react";
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
import { buildPriceChartRows, seriesHasVolume, type PriceChartRow } from "./priceChartData";

const volAxisFmt = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatAxisDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(n: number): string {
  return volAxisFmt.format(n);
}

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: PriceChartRow;
  fill?: string;
};

function VolumeBarShape(props: unknown): ReactElement {
  const { x = 0, y = 0, width = 0, height = 0, payload, fill } = props as BarShapeProps;
  if (payload?.volume == null) return <g />;
  if (!Number.isFinite(height) || height <= 0) return <g />;
  return <rect x={x} y={y} width={width} height={height} fill={fill} rx={1} ry={1} />;
}

function ChartTooltip({
  active,
  payload,
  showVolume,
}: {
  active?: boolean;
  payload?: { payload?: PriceChartRow }[];
  showVolume: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid var(--card-border)`,
        borderRadius: 8,
        color: "var(--fg)",
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 600 }}>{new Date(row.t).toLocaleString()}</div>
      <div>Close: {formatPrice(row.price)}</div>
      {showVolume && (
        <div>Volume: {row.volume == null ? "—" : formatVolume(row.volume)}</div>
      )}
    </div>
  );
}

export function PriceChart({ data }: { data: GetPricesResponse }) {
  const rows = buildPriceChartRows(data);
  if (rows.length === 0) return <p className="muted">No data to chart.</p>;

  const hasVolume = seriesHasVolume(data.series);
  const ariaLabel = hasVolume ? "Price and volume over time chart" : "Price over time line chart";

  return (
    <div className="chart-wrap" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: hasVolume ? 52 : 8, left: 0, bottom: 0 }}
        >
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
          {hasVolume && (
            <YAxis
              yAxisId="vol"
              orientation="right"
              dataKey="volume"
              width={48}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatVolume(v)}
            />
          )}
          <Tooltip
            content={<ChartTooltip showVolume={hasVolume} />}
            cursor={{ stroke: "var(--card-border)", strokeOpacity: 0.35 }}
          />
          {hasVolume && (
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="var(--fg-muted)"
              fillOpacity={0.28}
              maxBarSize={14}
              shape={VolumeBarShape}
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="price"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--accent)", fill: "var(--bg)" }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
