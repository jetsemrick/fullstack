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
import {
  type AlignedCompareRow,
  type NormalizeMode,
  seriesColor,
} from "./compareChartData";

function spanCalendarDays(rows: { t: number }[]): number {
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

function formatTooltipWhen(ms: number, spanDays: number): string {
  const d = new Date(ms);
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

type CompareTooltipProps = {
  active?: boolean;
  payload?: { dataKey?: string; value?: number; color?: string }[];
  label?: number;
  spanDays: number;
  normalizeMode: NormalizeMode;
};

function CompareTooltip({ active, payload, label, spanDays, normalizeMode }: CompareTooltipProps) {
  if (!active || !payload?.length || typeof label !== "number") return null;

  const entries = payload.filter(
    (p) => p.dataKey && typeof p.value === "number",
  );

  return (
    <div
      className="compare-tooltip"
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        color: "var(--fg)",
        boxShadow: "var(--shadow)",
        padding: "12px",
      }}
    >
      <div style={{ marginBottom: "8px", fontWeight: 600 }}>
        {formatTooltipWhen(label, spanDays)}
      </div>
      {entries.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: entry.color,
              flexShrink: 0,
            }}
          />
          <span>{entry.dataKey}</span>
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {normalizeMode === "indexed"
              ? formatIndexed(entry.value!)
              : formatPrice(entry.value!)}
          </span>
        </div>
      ))}
    </div>
  );
}

type ComparePriceChartProps = {
  rows: AlignedCompareRow[];
  tickers: string[];
  normalizeMode: NormalizeMode;
};

export function ComparePriceChart({ rows, tickers, normalizeMode }: ComparePriceChartProps) {
  const spanDays = spanCalendarDays(rows);
  const tickFormatter = (ms: number) => formatDailyAxisTick(ms, spanDays);

  const yTickFormatter = useMemo(
    () => (v: number) =>
      normalizeMode === "indexed" ? formatIndexed(v) : formatPrice(v),
    [normalizeMode],
  );

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>
        No data to chart.
      </p>
    );
  }

  const ariaLabel = `Compare price chart with ${tickers.length} symbols: ${tickers.join(", ")}`;

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%" minHeight={320}>
        <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
            label={
              normalizeMode === "indexed"
                ? { value: "Indexed (start=100)", angle: -90, position: "insideLeft", fill: "var(--fg-muted)", fontSize: 11 }
                : undefined
            }
          />
          <Tooltip
            content={
              <CompareTooltip spanDays={spanDays} normalizeMode={normalizeMode} />
            }
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: "12px", fontSize: "13px" }}
          />
          {tickers.map((ticker, i) => (
            <Line
              key={ticker}
              type="linear"
              dataKey={ticker}
              name={ticker}
              stroke={seriesColor(i)}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, stroke: "var(--bg)", strokeWidth: 2, fill: seriesColor(i) }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
