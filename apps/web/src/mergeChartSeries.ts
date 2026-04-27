import type { PricePoint } from "@stock/shared";

export type FetchSeriesOk = { ok: true; ticker: string; series: PricePoint[] };
export type FetchSeriesFail = { ok: false; ticker: string; error: string };
export type FetchSeriesResult = FetchSeriesOk | FetchSeriesFail;

/** One chart row: time (ms) plus indexed percent per symbol (100 = start of series). */
export type MergedChartRow = { t: number } & Record<string, number | null | undefined>;

function sortPointsByTime(points: PricePoint[]): PricePoint[] {
  return [...points].sort((a, b) => a.timestamp - b.timestamp);
}

/** First strictly positive finite close in chronological order; used as 100% baseline. */
export function firstValidBaseClose(points: PricePoint[]): number | null {
  for (const p of sortPointsByTime(points)) {
    if (typeof p.close === "number" && Number.isFinite(p.close) && p.close > 0) {
      return p.close;
    }
  }
  return null;
}

/**
 * Merges multiple daily series onto a common time index. Values are **percent of each
 * symbol’s first valid close** (indexed to 100 at series start) so different price levels
 * are comparable on one axis.
 */
export function mergeTimeAlignedIndexedPercent(
  results: FetchSeriesResult[],
): { rows: MergedChartRow[]; tickersOnChart: string[]; failed: { ticker: string; error: string }[] } {
  const failed: { ticker: string; error: string }[] = [];
  const okList: FetchSeriesOk[] = [];
  for (const r of results) {
    if (!r.ok) {
      failed.push({ ticker: r.ticker, error: r.error });
      continue;
    }
    okList.push(r);
  }

  if (okList.length === 0) {
    return { rows: [], tickersOnChart: [], failed };
  }

  const closeByTickerTs = new Map<string, Map<number, number>>();
  const bases = new Map<string, number>();

  for (const { ticker, series } of okList) {
    const base = firstValidBaseClose(series);
    if (base == null) {
      failed.push({ ticker, error: "No valid prices to index" });
      continue;
    }
    bases.set(ticker, base);
    const tsMap = new Map<number, number>();
    for (const p of series) {
      if (typeof p.close === "number" && Number.isFinite(p.close) && p.close > 0) {
        tsMap.set(p.timestamp, p.close);
      }
    }
    closeByTickerTs.set(ticker, tsMap);
  }

  const tickersOnChart = [...bases.keys()];
  if (tickersOnChart.length === 0) {
    return { rows: [], tickersOnChart: [], failed };
  }

  const allTs = new Set<number>();
  for (const t of tickersOnChart) {
    const m = closeByTickerTs.get(t);
    if (m) {
      for (const ts of m.keys()) allTs.add(ts);
    }
  }
  const sortedTs = [...allTs].sort((a, b) => a - b);

  const rows: MergedChartRow[] = [];
  for (const ts of sortedTs) {
    const row: MergedChartRow = { t: ts * 1000 };
    for (const sym of tickersOnChart) {
      const base = bases.get(sym)!;
      const close = closeByTickerTs.get(sym)?.get(ts);
      if (close == null) {
        row[sym] = null;
      } else {
        row[sym] = (close / base) * 100;
      }
    }
    rows.push(row);
  }

  return { rows, tickersOnChart, failed };
}
