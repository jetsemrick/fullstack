import { COMPARE_COLORS, colorForCompareIndex } from "./priceChartData";

/** Ensures value is a 6-digit hex string for `<input type="color">`. */
export function colorForCompareInput(color: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  const match = COMPARE_COLORS.find((c) => c === color);
  if (match) return match;
  return colorForCompareIndex(0);
}
