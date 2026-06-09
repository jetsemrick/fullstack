export type PriceChartSelection = {
  startMs: number;
  endMs: number;
  startPrice: number;
  endPrice: number;
  pointCount: number;
};

export type PriceChartSelectionRow = {
  t: number;
  price: number;
};

export function getPriceChartSelectionFromRange(
  rows: PriceChartSelectionRow[],
  a: number,
  b: number,
): PriceChartSelection | null {
  const startMs = Math.min(a, b);
  const endMs = Math.max(a, b);
  if (startMs === endMs) return null;

  const selectedRows = rows.filter((row) => row.t >= startMs && row.t <= endMs);
  if (selectedRows.length < 2) return null;

  const first = selectedRows[0]!;
  const last = selectedRows[selectedRows.length - 1]!;
  return {
    startMs: first.t,
    endMs: last.t,
    startPrice: first.price,
    endPrice: last.price,
    pointCount: selectedRows.length,
  };
}
