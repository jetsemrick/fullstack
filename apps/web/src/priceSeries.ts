import type { GetPricesResponse } from "@stock/shared";

const SECONDS_PER_DAY = 24 * 60 * 60;

export function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (latestTimestamp == null) return data;
  const cutoff = latestTimestamp - horizonDays * SECONDS_PER_DAY;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}
