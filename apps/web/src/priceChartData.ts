import type { GetPricesResponse, PricePoint } from "@stock/shared";

export type FetchSeriesOk = { ok: true; ticker: string; series: PricePoint[] };
export type FetchSeriesFail = { ok: false; ticker: string; error: string };
export type FetchSeriesResult = FetchSeriesOk | FetchSeriesFail;

export type PriceChartRow = { t: number } & Record<string, number | null | undefined>;

export type PriceVolumeRow = {
  t: number;
  price: number;
  volume: number | null;
  /** Bar height; missing volume maps to 0 */
  volumeBar: number;
};

export function seriesHasVolume(series: PricePoint[]): boolean {
  return series.some((p) => p.volume != null);
}

export function buildPriceVolumeRows(data: GetPricesResponse): PriceVolumeRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    price: p.close,
    volume: p.volume,
    volumeBar: p.volume ?? 0,
  }));
}

export function buildSinglePriceRows(data: GetPricesResponse): PriceChartRow[] {
  return data.series.map((p) => ({
    t: p.timestamp * 1000,
    [data.ticker]: p.close,
  }));
}

function sortPointsByTime(points: PricePoint[]): PricePoint[] {
  return [...points].sort((a, b) => a.timestamp - b.timestamp);
}

/** First strictly positive finite close in chronological order; used as the 100% baseline. */
export function firstValidBaseClose(points: PricePoint[]): number | null {
  for (const point of sortPointsByTime(points)) {
    if (Number.isFinite(point.close) && point.close > 0) {
      return point.close;
    }
  }
  return null;
}

export function mergeTimeAlignedIndexedPercent(
  results: FetchSeriesResult[],
): { rows: PriceChartRow[]; tickersOnChart: string[]; failed: { ticker: string; error: string }[] } {
  const failed: { ticker: string; error: string }[] = [];
  const okResults: FetchSeriesOk[] = [];

  for (const result of results) {
    if (result.ok) {
      okResults.push(result);
    } else {
      failed.push({ ticker: result.ticker, error: result.error });
    }
  }

  const closeByTickerTs = new Map<string, Map<number, number>>();
  const bases = new Map<string, number>();

  for (const { ticker, series } of okResults) {
    const base = firstValidBaseClose(series);
    if (base == null) {
      failed.push({ ticker, error: "No valid prices to index" });
      continue;
    }

    const closes = new Map<number, number>();
    for (const point of series) {
      if (Number.isFinite(point.close) && point.close > 0) {
        closes.set(point.timestamp, point.close);
      }
    }

    bases.set(ticker, base);
    closeByTickerTs.set(ticker, closes);
  }

  const tickersOnChart = [...bases.keys()];
  const timestamps = new Set<number>();
  for (const ticker of tickersOnChart) {
    for (const timestamp of closeByTickerTs.get(ticker)?.keys() ?? []) {
      timestamps.add(timestamp);
    }
  }

  const rows = [...timestamps].sort((a, b) => a - b).map((timestamp) => {
    const row: PriceChartRow = { t: timestamp * 1000 };
    for (const ticker of tickersOnChart) {
      const close = closeByTickerTs.get(ticker)?.get(timestamp);
      row[ticker] = close == null ? null : (close / bases.get(ticker)!) * 100;
    }
    return row;
  });

  return { rows, tickersOnChart, failed };
}

export function formatVolumeAxis(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatVolumeTooltip(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
