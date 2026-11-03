import type { GetPricesResponse, PricePoint } from "@stock/shared";
import { filterSeriesByHorizon } from "./priceChartData";
import { easternYear } from "./usMarket";

export type ChartVariant = "intraday" | "multiday" | "daily";

type RangeWindow =
  | { kind: "all" }
  | { kind: "days"; days: number }
  | { kind: "months"; months: number }
  | { kind: "ytd" };

export type RangeOption = {
  id: "1d" | "5d" | "1m" | "6m" | "ytd" | "1y" | "5y" | "max";
  label: string;
  ariaLabel?: string;
  fetch: { range: string; interval: string };
  chart: ChartVariant;
  window: RangeWindow;
};

// Yahoo's `max` series is ~quarterly bars, so sub-year daily ranges trim the shared 1y daily fetch.
const ONE_YEAR_DAILY = { range: "1y", interval: "1d" };

export const RANGES: readonly RangeOption[] = [
  { id: "1d", label: "Today", fetch: { range: "1d", interval: "5m" }, chart: "intraday", window: { kind: "all" } },
  { id: "5d", label: "5D", fetch: { range: "5d", interval: "15m" }, chart: "multiday", window: { kind: "all" } },
  { id: "1m", label: "1M", fetch: ONE_YEAR_DAILY, chart: "daily", window: { kind: "months", months: 1 } },
  { id: "6m", label: "6M", fetch: ONE_YEAR_DAILY, chart: "daily", window: { kind: "months", months: 6 } },
  { id: "ytd", label: "YTD", fetch: ONE_YEAR_DAILY, chart: "daily", window: { kind: "ytd" } },
  { id: "1y", label: "1Y", fetch: ONE_YEAR_DAILY, chart: "daily", window: { kind: "days", days: 365 } },
  { id: "5y", label: "5Y", fetch: { range: "5y", interval: "1d" }, chart: "daily", window: { kind: "days", days: 1825 } },
  { id: "max", label: "All", ariaLabel: "All time", fetch: { range: "max", interval: "1d" }, chart: "daily", window: { kind: "all" } },
];

export type RangeSlice = {
  data: GetPricesResponse;
  /** Close the % change is measured from; the first point's close unless the range defines a prior close. */
  baseClose: number | null;
};

function withSeries(data: GetPricesResponse, series: PricePoint[]): GetPricesResponse {
  return { ...data, series: series.length > 0 ? series : data.series.slice(-1) };
}

/** Same wall-clock instant `months` calendar months earlier (UTC), clamped to the target month's last day. */
export function monthsBeforeSec(timestampSec: number, months: number): number {
  const d = new Date(timestampSec * 1000);
  const targetMonth = d.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const shifted = Date.UTC(
    d.getUTCFullYear(),
    targetMonth,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return Math.floor(shifted / 1000);
}

export function sliceForRange(data: GetPricesResponse, option: RangeOption): RangeSlice {
  const { series } = data;
  const first = (s: PricePoint[]) => s[0]?.close ?? null;
  const latest = series[series.length - 1]?.timestamp;
  const w = option.window;

  if (w.kind === "all" || latest === undefined) return { data, baseClose: first(series) };

  if (w.kind === "days") {
    const sliced = filterSeriesByHorizon(data, w.days);
    return { data: sliced, baseClose: first(sliced.series) };
  }

  if (w.kind === "months") {
    const cutoff = monthsBeforeSec(latest, w.months);
    const sliced = withSeries(data, series.filter((p) => p.timestamp >= cutoff));
    return { data: sliced, baseClose: first(sliced.series) };
  }

  const year = easternYear(latest * 1000);
  const start = series.findIndex((p) => easternYear(p.timestamp * 1000) === year);
  if (start === -1) {
    const sliced = withSeries(data, []);
    return { data: sliced, baseClose: first(sliced.series) };
  }
  const prior = start > 0 ? series[start - 1]! : undefined;
  return {
    data: withSeries(data, series.slice(start)),
    baseClose: prior ? prior.close : series[start]!.close,
  };
}

export function percentChange(slice: RangeSlice): number | null {
  const { series } = slice.data;
  if (series.length === 0 || !slice.baseClose) return null;
  if (series.length < 2 && slice.baseClose === series[0]!.close) return null;
  const last = series[series.length - 1]!.close;
  return ((last - slice.baseClose) / slice.baseClose) * 100;
}
