import { EASTERN } from "./usMarket";

/** Short label for EASTERN shown next to intraday times. */
export const MARKET_TZ_LABEL = "ET";

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

/** Intraday x-axis label; `compact` drops minutes ("10 AM") for narrow screens, where ticks fall on the hour. */
export function formatIntradayAxisTick(ms: number, locale?: string, compact = false): string {
  return new Date(ms).toLocaleTimeString(
    locale,
    compact ? { timeZone: EASTERN, hour: "numeric" } : { timeZone: EASTERN, hour: "numeric", minute: "2-digit" },
  );
}

/**
 * Thins hourly session ticks (10:00–16:00 ET) for narrow charts: every 2nd hour gives 10, 12, 2, 4;
 * every 3rd gives 10, 1, 4.
 */
export function compactSessionTicks(ticks: number[], everyHours: 2 | 3 = 2): number[] {
  const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, hour: "numeric", hourCycle: "h23" });
  return ticks.filter((ms) => (Number(hourFmt.format(ms)) - 10) % everyHours === 0);
}

export function formatTooltipWhen(
  ms: number,
  variant: "daily" | "intraday",
  spanDays: number,
  locale?: string,
): string {
  const d = new Date(ms);
  if (variant === "intraday") {
    return d.toLocaleString(locale, {
      timeZone: EASTERN,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (spanDays > 365 * 5) {
    return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "long", year: "numeric" });
  }
  return d.toLocaleDateString(locale, { timeZone: EASTERN, month: "long", day: "numeric", year: "numeric" });
}
