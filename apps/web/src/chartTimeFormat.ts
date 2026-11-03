import { EASTERN } from "./usMarket";

/** X-axis labels for daily series: format depends on chart span so ticks read as calendar milestones. */
export function formatDailyAxisTick(ms: number, spanDays: number, locale?: string): string {
  const d = new Date(ms);
  if (spanDays > 365 * 5) {
    return d.toLocaleDateString(locale, { timeZone: EASTERN, year: "numeric" });
  }
  if (spanDays > 120) {
    return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "short", year: "numeric" });
  }
  return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "short", day: "numeric" });
}

export function formatIntradayAxisTick(ms: number, locale?: string): string {
  return new Date(ms).toLocaleTimeString(locale, { timeZone: EASTERN, hour: "numeric", minute: "2-digit" });
}

export function formatTooltipWhen(
  ms: number,
  variant: "daily" | "intraday",
  spanDays: number,
  locale?: string,
): string {
  const d = new Date(ms);
  if (variant === "intraday") {
    const when = d.toLocaleString(locale, {
      timeZone: EASTERN,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${when} ET`;
  }
  if (spanDays > 365 * 5) {
    return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "long", year: "numeric" });
  }
  return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "long", day: "numeric", year: "numeric" });
}
