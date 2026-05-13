import type { GetPricesResponse, PricePoint } from "@stock/shared";

/** Slice `series` using a shared cutoff derived from `anchorTimestamp` (unix seconds). */
function filterFromCutoff(data: GetPricesResponse, cutoff: number): GetPricesResponse {
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

/**
 * Per-ticker horizon slice using that series' latest bar as the anchor (existing app behavior).
 */
export function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60;
  return filterFromCutoff(data, cutoff);
}

/**
 * When comparing two tickers, anchor the window to the earlier of the two series ends so both
 * share the same cutoff and the visible range matches.
 */
export function filterPairBySharedHorizon(
  primary: GetPricesResponse,
  secondary: GetPricesResponse,
  horizonDays: number,
): [GetPricesResponse, GetPricesResponse] {
  if (horizonDays === Infinity) return [primary, secondary];
  const lastP = primary.series[primary.series.length - 1]?.timestamp;
  const lastS = secondary.series[secondary.series.length - 1]?.timestamp;
  if (lastP == null || lastS == null) {
    return [filterSeriesByHorizon(primary, horizonDays), filterSeriesByHorizon(secondary, horizonDays)];
  }
  const anchor = Math.min(lastP, lastS);
  const cutoff = anchor - horizonDays * 24 * 60 * 60;
  return [filterFromCutoff(primary, cutoff), filterFromCutoff(secondary, cutoff)];
}

export type AlignedComparisonRow = {
  /** X value for Recharts (unix ms) */
  t: number;
  /** Unix seconds — used for CSV alignment */
  timestamp: number;
  primaryClose: number | null;
  secondaryClose: number | null;
};

function pointMap(series: PricePoint[]): Map<number, number> {
  return new Map(series.map((p) => [p.timestamp, p.close]));
}

/** Union of timestamps sorted ascending; missing side is `null`. */
export function alignSeriesByTimestamp(
  primary: GetPricesResponse,
  secondary: GetPricesResponse,
): AlignedComparisonRow[] {
  const ts = new Set<number>();
  for (const p of primary.series) ts.add(p.timestamp);
  for (const p of secondary.series) ts.add(p.timestamp);
  const sorted = [...ts].sort((a, b) => a - b);
  const mapP = pointMap(primary.series);
  const mapS = pointMap(secondary.series);
  return sorted.map((timestamp) => ({
    t: timestamp * 1000,
    timestamp,
    primaryClose: mapP.get(timestamp) ?? null,
    secondaryClose: mapS.get(timestamp) ?? null,
  }));
}
