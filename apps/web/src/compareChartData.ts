import type { GetPricesResponse } from "@stock/shared";

export const MAX_COMPARE_TICKERS = 5;

/** Distinct line colors for compare mode (legend labels required for accessibility). */
export const CHART_SERIES_COLORS = [
  "var(--accent)",
  "#4a7c9e",
  "#c47a2c",
  "#7b5ea7",
  "#ba3b3b",
] as const;

export type NormalizeMode = "indexed" | "absolute";

export type AlignedCompareRow = {
  t: number;
  [ticker: string]: number | null | undefined;
};

export function utcDayMs(timestampSeconds: number): number {
  const d = new Date(timestampSeconds * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function alignSeriesByDay(responses: GetPricesResponse[]): {
  rows: AlignedCompareRow[];
  tickers: string[];
} {
  const tickers = responses.map((r) => r.ticker);
  const dayMap = new Map<number, AlignedCompareRow>();

  for (const resp of responses) {
    for (const p of resp.series) {
      const dayMs = utcDayMs(p.timestamp);
      let row = dayMap.get(dayMs);
      if (!row) {
        row = { t: dayMs };
        dayMap.set(dayMs, row);
      }
      row[resp.ticker] = p.close;
    }
  }

  const rows = Array.from(dayMap.values()).sort((a, b) => a.t - b.t);
  return { rows, tickers };
}

export function applyNormalization(
  rows: AlignedCompareRow[],
  tickers: string[],
  mode: NormalizeMode,
): AlignedCompareRow[] {
  if (mode === "absolute") return rows;

  const bases: Record<string, number> = {};
  for (const ticker of tickers) {
    for (const row of rows) {
      const v = row[ticker];
      if (typeof v === "number" && v !== 0) {
        bases[ticker] = v;
        break;
      }
    }
  }

  return rows.map((row) => {
    const next: AlignedCompareRow = { t: row.t };
    for (const ticker of tickers) {
      const v = row[ticker];
      const base = bases[ticker];
      if (typeof v === "number" && base) {
        next[ticker] = (v / base) * 100;
      } else if (typeof v === "number") {
        next[ticker] = v;
      } else {
        next[ticker] = null;
      }
    }
    return next;
  });
}

export function buildCompareChartRows(
  responses: GetPricesResponse[],
  mode: NormalizeMode,
): { rows: AlignedCompareRow[]; tickers: string[] } {
  const { rows, tickers } = alignSeriesByDay(responses);
  return { rows: applyNormalization(rows, tickers, mode), tickers };
}

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]!;
}
