import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useId, useMemo } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";
import {
  buildOverlayRows,
  buildPriceVolumeRows,
  calendarAxisTicks,
  downsampleRows,
  formatVolumeAxis,
  formatVolumeTooltip,
  type OverlayChartRow,
  type PriceVolumeRow,
} from "./priceChartData";

const MAX_DAILY_RENDER_POINTS = 1_200;

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

function sliceRowsToSeries<T extends { t: number }>(rows: T[], data: GetPricesResponse): T[] {
  const start = data.series[0]?.timestamp;
  const end = data.series[data.series.length - 1]?.timestamp;
  if (start == null || end == null) return rows;
  const startMs = start * 1000;
  const endMs = end * 1000;
  return rows.filter((row) => row.t >= startMs && row.t <= endMs);
}

export type PriceChartVariant = "daily" | "intraday";

export type ChartOverlays = {
  sma50?: boolean;
  sma200?: boolean;
  volume?: boolean;
};

type ChartPoint = OverlayChartRow | PriceVolumeRow;

function ChartTooltip({
  active,
  payload,
  variant,
  spanDays,
  showSma50,
  showSma200,
  showVolume,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  variant: PriceChartVariant;
  spanDays: number;
  showSma50: boolean;
  showSma200: boolean;
  showVolume: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const smaRow = row as OverlayChartRow;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__when">{formatTooltipWhen(row.t, variant, spanDays)}</div>
      <div>Close {formatPrice(row.price)}</div>
      {showSma50 ? (
        <div className="chart-tooltip__sma50">
          SMA 50 {smaRow.sma50 == null ? "—" : formatPrice(smaRow.sma50)}
        </div>
      ) : null}
      {showSma200 ? (
        <div className="chart-tooltip__sma200">
          SMA 200 {smaRow.sma200 == null ? "—" : formatPrice(smaRow.sma200)}
        </div>
      ) : null}
      {showVolume ? <div className="chart-tooltip__volume">Volume {formatVolumeTooltip(row.volume)}</div> : null}
    </div>
  );
}

export function PriceChart({
  data,
  overlaySource,
  variant = "daily",
  overlays,
}: {
  data: GetPricesResponse;
  /** Full daily series used to compute SMAs before the visible window is sliced. */
  overlaySource?: GetPricesResponse;
  variant?: PriceChartVariant;
  overlays?: ChartOverlays;
}) {
  const fillGradientId = useId().replace(/:/g, "");
  const showSma50 = variant === "daily" && Boolean(overlays?.sma50);
  const showSma200 = variant === "daily" && Boolean(overlays?.sma200);
  const showVolume = variant === "daily" && Boolean(overlays?.volume);

  const fullRows = useMemo(() => {
    const source = overlaySource ?? data;
    if (variant === "intraday") {
      const rows = buildPriceVolumeRows(source);
      return source === data ? rows : sliceRowsToSeries(rows, data);
    }
    const rows = buildOverlayRows(source);
    return source === data ? rows : sliceRowsToSeries(rows, data);
  }, [data, overlaySource, variant]);

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
      const dataStart = rows[0].t;
      const dataEnd = rows[rows.length - 1].t;
      // Anchor left to first bar so pre-market domain padding does not leave empty chart space.
      return [dataStart, Math.max(dataEnd, sessionLayout.rth[1])];
    }
    if (variant === "intraday" && sessionLayout) return [sessionLayout.rth[0], sessionLayout.rth[1]];
    if (rows.length > 0) return [rows[0].t, rows[rows.length - 1].t];
    return ["dataMin", "dataMax"];
  }, [variant, sessionLayout, rows]);

  const dailyTicks = useMemo(() => {
    if (variant !== "daily" || rows.length < 2) return undefined;
    return calendarAxisTicks(rows[0]!.t, rows[rows.length - 1]!.t);
  }, [variant, rows]);

  const maxVolume = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      if (row.volumeBar > max) max = row.volumeBar;
    }
    return max;
  }, [rows]);
  const volumeDomainMax = maxVolume > 0 ? maxVolume : 1;

  if (rows.length === 0) return <p className="muted" style={{ textAlign: "center", marginTop: "2rem" }}>No data to chart.</p>;

  const chartMargin = { top: 10, right: 36, left: 0, bottom: showVolume ? 18 : 0 };
  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      domain={xDomain}
      scale="time"
      ticks={variant === "intraday" ? intradayTicks : dailyTicks}
      tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
      tickLine={false}
      axisLine={false}
      tickFormatter={tickFormatter}
      minTickGap={variant === "intraday" ? 0 : 24}
      dy={10}
    />
  );

  return (
    <div
      className={`price-chart${showVolume ? " price-chart--with-volume" : ""}`}
      role="img"
      aria-label="Price over time line chart"
    >
      <div className="price-chart__price">
        <ResponsiveContainer width="100%" height="100%" minHeight={showVolume ? 240 : 320}>
          <ComposedChart syncId="stock-chart" data={rows} margin={chartMargin}>
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
            {showVolume ? (
              <XAxis dataKey="t" type="number" domain={xDomain} scale="time" ticks={dailyTicks} hide />
            ) : (
              xAxis
            )}
            <YAxis
              yAxisId="price"
              dataKey="price"
              domain={["auto", "auto"]}
              interval="preserveStartEnd"
              width={60}
              tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatPrice(v)}
              dx={-10}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload as ReadonlyArray<{ payload?: ChartPoint }> | undefined}
                  variant={variant}
                  spanDays={spanDays}
                  showSma50={showSma50}
                  showSma200={showSma200}
                  showVolume={false}
                />
              )}
            />
            <Area
              yAxisId="price"
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
            {showSma50 ? (
              <Line
                yAxisId="price"
                type="linear"
                dataKey="sma50"
                name="SMA 50"
                stroke="var(--sma-50)"
                strokeWidth={1.5}
                strokeOpacity={0.85}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
            {showSma200 ? (
              <Line
                yAxisId="price"
                type="linear"
                dataKey="sma200"
                name="SMA 200"
                stroke="var(--sma-200)"
                strokeWidth={1.5}
                strokeOpacity={0.85}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showVolume ? (
        <>
          <div className="price-chart__gap" aria-hidden="true" />
          <div className="price-chart__volume">
            <div className="price-chart__volume-max">{formatVolumeAxis(maxVolume)}</div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart syncId="stock-chart" data={rows} margin={{ ...chartMargin, top: 4 }}>
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={xDomain}
                  scale="time"
                  ticks={dailyTicks}
                  tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={tickFormatter}
                  minTickGap={24}
                  dy={10}
                />
                <YAxis yAxisId="volume" domain={[0, volumeDomainMax]} width={60} hide />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      payload={props.payload as ReadonlyArray<{ payload?: ChartPoint }> | undefined}
                      variant={variant}
                      spanDays={spanDays}
                      showSma50={false}
                      showSma200={false}
                      showVolume
                    />
                  )}
                />
                <Bar
                  yAxisId="volume"
                  dataKey="volumeBar"
                  name="Volume"
                  fill="var(--volume-bar)"
                  fillOpacity={0.72}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </div>
  );
}
