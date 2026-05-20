import type { GetPricesResponse, PricePoint } from "@stock/shared";

export const EMA_SHORT_PERIOD = 50;
export const EMA_LONG_PERIOD = 200;

export type EmaCrossoverType = "golden" | "death";

export interface EmaCrossover {
  timestamp: number;
  type: EmaCrossoverType;
  ema50: number;
  ema200: number;
}

export interface ChartRowWithEma {
  t: number;
  price: number;
  ema50: number | null;
  ema200: number | null;
  crossover: EmaCrossoverType | null;
}

/** Exponential moving average seeded with SMA at the first full window. */
export function computeEma(closes: number[], period: number): (number | null)[] {
  if (period < 1 || closes.length === 0) return [];
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i]!;
  let ema = sum / period;
  out[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i]! * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function detectEmaCrossovers(
  series: PricePoint[],
  ema50: (number | null)[],
  ema200: (number | null)[],
): EmaCrossover[] {
  const crossovers: EmaCrossover[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev50 = ema50[i - 1];
    const prev200 = ema200[i - 1];
    const curr50 = ema50[i];
    const curr200 = ema200[i];
    if (prev50 == null || prev200 == null || curr50 == null || curr200 == null) continue;

    const prevDiff = prev50 - prev200;
    const currDiff = curr50 - curr200;
    if (prevDiff === 0 && currDiff === 0) continue;

    let type: EmaCrossoverType | null = null;
    if (prevDiff <= 0 && currDiff > 0) type = "golden";
    else if (prevDiff >= 0 && currDiff < 0) type = "death";
    if (!type) continue;

    crossovers.push({
      timestamp: series[i]!.timestamp,
      type,
      ema50: curr50,
      ema200: curr200,
    });
  }
  return crossovers;
}

function emaByTimestamp(
  source: PricePoint[],
  ema50: (number | null)[],
  ema200: (number | null)[],
): Map<number, { ema50: number | null; ema200: number | null }> {
  const map = new Map<number, { ema50: number | null; ema200: number | null }>();
  for (let i = 0; i < source.length; i++) {
    map.set(source[i]!.timestamp, { ema50: ema50[i] ?? null, ema200: ema200[i] ?? null });
  }
  return map;
}

/** Build chart rows for `display` using EMA values computed on `emaSource` (defaults to display). */
export function buildChartRowsWithEma(
  display: GetPricesResponse,
  emaSource?: GetPricesResponse | null,
): { rows: ChartRowWithEma[]; crossovers: EmaCrossover[] } {
  const source = emaSource ?? display;
  const closes = source.series.map((p) => p.close);
  const ema50 = computeEma(closes, EMA_SHORT_PERIOD);
  const ema200 = computeEma(closes, EMA_LONG_PERIOD);
  const crossovers = detectEmaCrossovers(source.series, ema50, ema200);
  const crossoverAt = new Map(crossovers.map((c) => [c.timestamp, c.type] as const));
  const lookup = emaByTimestamp(source.series, ema50, ema200);

  const rows: ChartRowWithEma[] = display.series.map((p) => {
    const emas = lookup.get(p.timestamp);
    return {
      t: p.timestamp * 1000,
      price: p.close,
      ema50: emas?.ema50 ?? null,
      ema200: emas?.ema200 ?? null,
      crossover: crossoverAt.get(p.timestamp) ?? null,
    };
  });

  const visibleCrossovers = crossovers.filter((c) =>
    display.series.some((p) => p.timestamp === c.timestamp),
  );

  return { rows, crossovers: visibleCrossovers };
}

export function formatCrossoverLabel(type: EmaCrossoverType): string {
  return type === "golden" ? "Golden cross (EMA50 above EMA200)" : "Death cross (EMA50 below EMA200)";
}

export function formatCrossoverDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
