import { useEffect, useId, useMemo, useState } from "react";
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
import { FAVORITES_INTRADAY_COUNT, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { pickFavoriteTickers } from "./favoritesPick";
import { hourlySessionTicksUtcMs, regularSessionDomainUtcMs } from "./usMarket";

const LINE_COLORS = [
  "var(--accent)",
  "#2563eb",
  "#15803d",
  "#9333ea",
  "#ca8a04",
] as const;

type ChartRow = { t: number } & Record<string, number | undefined>;

function seriesToPctByMs(data: GetPricesResponse): Map<number, number> {
  const pts = data.series;
  const map = new Map<number, number>();
  if (pts.length === 0) return map;
  const first = pts[0]!.close;
  if (!first || first <= 0) return map;
  for (const p of pts) {
    map.set(p.timestamp * 1000, ((p.close / first) - 1) * 100);
  }
  return map;
}

function mergedRows(symbols: string[], responses: GetPricesResponse[]): ChartRow[] {
  const maps = symbols.map((sym, i) => ({ sym, pct: seriesToPctByMs(responses[i]!) }));
  const tsSet = new Set<number>();
  for (const { pct } of maps) {
    for (const t of pct.keys()) tsSet.add(t);
  }
  const sorted = [...tsSet].sort((a, b) => a - b);
  return sorted.map((t) => {
    const row: ChartRow = { t };
    for (const { sym, pct } of maps) {
      const v = pct.get(t);
      if (v !== undefined) row[sym] = v;
    }
    return row;
  });
}

function formatIntradayAxisTick(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

type Props = {
  mainTicker: string;
  /** Stable per-session day seed from `getDailyFavoriteShuffleSeed()`. */
  shuffleSeed: number;
};

export function FavoritesChart({ mainTicker, shuffleSeed }: Props) {
  const titleId = useId();
  const tickers = useMemo(
    () => pickFavoriteTickers(mainTicker, FAVORITES_INTRADAY_COUNT, shuffleSeed),
    [mainTicker, shuffleSeed],
  );

  const [bundle, setBundle] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; symbols: string[]; data: GetPricesResponse[] }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setBundle({ status: "loading" });
    void (async () => {
      const results = await Promise.all(
        tickers.map((t) => fetchPrices({ ticker: t, range: "1d", interval: "5m" })),
      );
      if (cancelled) return;
      const okSymbols: string[] = [];
      const okData: GetPricesResponse[] = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if (r.ok && r.data.series.length > 0) {
          okSymbols.push(tickers[i]!);
          okData.push(r.data);
        }
      }
      if (okSymbols.length === 0) {
        const firstErr = results.find((x) => !x.ok && "error" in x) as { ok: false; error: { error?: string } } | undefined;
        setBundle({
          status: "error",
          message: firstErr?.error?.error ?? "Could not load intraday data.",
        });
        return;
      }
      setBundle({ status: "ready", symbols: okSymbols, data: okData });
    })();
    return () => {
      cancelled = true;
    };
  }, [tickers.join(",")]);

  const chartPayload = useMemo(() => {
    if (bundle.status !== "ready") return null;
    const rows = mergedRows(bundle.symbols, bundle.data);
    const anchorMs = rows.length > 0 ? rows[rows.length - 1]!.t : 0;
    const domain = anchorMs > 0 ? regularSessionDomainUtcMs(anchorMs) : undefined;
    const ticks = domain ? hourlySessionTicksUtcMs(domain[0], domain[1]) : undefined;
    return { rows, domain, ticks, symbols: bundle.symbols };
  }, [bundle]);

  if (bundle.status === "loading") {
    return (
      <div className="favorites-chart favorites-chart--loading" aria-busy="true">
        <h3 id={titleId} className="favorites-chart__title">Today&apos;s snapshots</h3>
        <p className="muted favorites-chart__hint">Five random ticker intraday moves (vs session open).</p>
        <div className="skeleton-chart favorites-chart__skeleton" aria-hidden />
      </div>
    );
  }

  if (bundle.status === "error" || !chartPayload || chartPayload.rows.length === 0) {
    return (
      <div className="favorites-chart">
        <h3 id={titleId} className="favorites-chart__title">Today&apos;s snapshots</h3>
        <p className="muted">{bundle.status === "error" ? bundle.message : "No data."}</p>
      </div>
    );
  }

  const { rows, domain, ticks, symbols } = chartPayload;

  return (
    <div className="favorites-chart">
      <h3 id={titleId} className="favorites-chart__title">Today&apos;s snapshots</h3>
      <p className="muted favorites-chart__hint">Five random ticker intraday % change vs session open.</p>
      <div className="favorites-chart__plot" role="img" aria-labelledby={titleId}>
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={domain ?? ["dataMin", "dataMax"]}
              scale="time"
              ticks={ticks}
              tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatIntradayAxisTick}
              minTickGap={0}
              dy={8}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={52}
              tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatPct(v)}
              dx={-6}
            />
            <Legend
              verticalAlign="top"
              formatter={(value) => <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>{value}</span>}
              wrapperStyle={{ paddingBottom: "0.35rem" }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "12px",
                color: "var(--fg)",
                boxShadow: "var(--shadow)",
                padding: "12px",
              }}
              formatter={(value: number | string, name: string) => [
                typeof value === "number" ? formatPct(value) : String(value),
                name,
              ]}
              labelFormatter={(_, payload) => {
                const t = (payload?.[0]?.payload as { t?: number })?.t;
                if (typeof t === "number") {
                  return new Date(t).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });
                }
                return "";
              }}
            />
            {symbols.map((sym, i) => (
              <Line
                key={sym}
                type="monotone"
                dataKey={sym}
                name={sym}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
