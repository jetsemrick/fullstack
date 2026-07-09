import type { AlignedCompareRow, CompareNormalization, CompareSeriesInput } from "@stock/shared";

function timestampKey(timestamp: number, variant: "daily" | "intraday"): number {
  if (variant === "intraday") return timestamp;
  return Math.floor(timestamp / 86_400) * 86_400;
}

function intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const value of a) {
    if (b.has(value)) out.add(value);
  }
  return out;
}

/**
 * Align multiple ticker series on their common timestamps.
 * Indexed mode rebases each series to 100 at the first shared point.
 */
export function alignCompareSeries(
  inputs: CompareSeriesInput[],
  mode: CompareNormalization,
  variant: "daily" | "intraday" = "daily",
): AlignedCompareRow[] {
  if (inputs.length === 0) return [];

  const keyed = inputs.map(({ ticker, series }) => {
    const map = new Map<number, number>();
    for (const point of series) {
      map.set(timestampKey(point.timestamp, variant), point.close);
    }
    return { ticker, map };
  });

  let commonKeys = new Set(keyed[0]!.map.keys());
  for (let i = 1; i < keyed.length; i++) {
    commonKeys = intersectSets(commonKeys, new Set(keyed[i]!.map.keys()));
  }

  const sortedKeys = [...commonKeys].sort((a, b) => a - b);
  if (sortedKeys.length === 0) return [];

  const rows: AlignedCompareRow[] = sortedKeys.map((key) => ({ t: key * 1000 }));

  for (const { ticker, map } of keyed) {
    const values = sortedKeys.map((key) => map.get(key)!);
    if (mode === "indexed") {
      const base = values[0];
      if (!base || base === 0) continue;
      for (let i = 0; i < sortedKeys.length; i++) {
        rows[i]![ticker] = (values[i]! / base) * 100;
      }
    } else {
      for (let i = 0; i < sortedKeys.length; i++) {
        rows[i]![ticker] = values[i];
      }
    }
  }

  return rows;
}
