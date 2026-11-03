import { afterAll, describe, expect, test } from "bun:test";
import { compactSessionTicks, formatDailyAxisTick, formatIntradayAxisTick, formatTooltipWhen } from "./chartTimeFormat";
import { hourlySessionTicksUtcMs, intradaySessionLayoutUtcMs } from "./usMarket";

const ORIGINAL_TZ = process.env.TZ;
const VIEWER_ZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Asia/Kolkata"];

// 2026-11-03 15:30 UTC = 10:30 EST; 2026-07-01 14:00 UTC = 10:00 EDT.
const NOV_3_1030_ET = Date.UTC(2026, 10, 3, 15, 30);
const JUL_1_1000_ET = Date.UTC(2026, 6, 1, 14, 0);
// 2026-03-02 03:00 UTC is still March 1 in New York but March 2 in Tokyo.
const MAR_1_2200_ET = Date.UTC(2026, 2, 2, 3, 0);

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe.each(VIEWER_ZONES)("viewer timezone %s", (zone) => {
  test("process timezone override is active", () => {
    process.env.TZ = zone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone === "UTC" ? "UTC" : zone);
  });

  test("Today axis ticks read 10 AM to 4 PM New York time", () => {
    process.env.TZ = zone;
    const layout = intradaySessionLayoutUtcMs(NOV_3_1030_ET)!;
    const ticks = hourlySessionTicksUtcMs(layout.rth[0], layout.rth[1]);
    expect(ticks.map((ms) => formatIntradayAxisTick(ms, "en-US"))).toEqual([
      "10:00 AM",
      "11:00 AM",
      "12:00 PM",
      "1:00 PM",
      "2:00 PM",
      "3:00 PM",
      "4:00 PM",
    ]);
  });

  test("narrow Today axis uses short New York labels (four, or three on the narrowest screens)", () => {
    process.env.TZ = zone;
    for (const anchor of [NOV_3_1030_ET, JUL_1_1000_ET]) {
      const layout = intradaySessionLayoutUtcMs(anchor)!;
      const ticks = compactSessionTicks(hourlySessionTicksUtcMs(layout.rth[0], layout.rth[1]));
      expect(ticks.map((ms) => formatIntradayAxisTick(ms, "en-US", true))).toEqual(["10 AM", "12 PM", "2 PM", "4 PM"]);
      const three = compactSessionTicks(hourlySessionTicksUtcMs(layout.rth[0], layout.rth[1]), 3);
      expect(three.map((ms) => formatIntradayAxisTick(ms, "en-US", true))).toEqual(["10 AM", "1 PM", "4 PM"]);
    }
  });

  test("intraday axis tick uses New York time across DST", () => {
    process.env.TZ = zone;
    expect(formatIntradayAxisTick(JUL_1_1000_ET, "en-US")).toBe("10:00 AM");
    expect(formatIntradayAxisTick(NOV_3_1030_ET, "en-US")).toBe("10:30 AM");
  });

  test("intraday tooltip shows New York time", () => {
    process.env.TZ = zone;
    expect(formatTooltipWhen(NOV_3_1030_ET, "intraday", 0, "en-US")).toBe("Nov 3, 10:30 AM");
    expect(formatTooltipWhen(JUL_1_1000_ET, "intraday", 0, "en-US")).toBe("Jul 1, 10:00 AM");
  });

  test("daily ticks and tooltip use the New York calendar day", () => {
    process.env.TZ = zone;
    expect(formatDailyAxisTick(MAR_1_2200_ET, 30, "en-US")).toBe("Mar 1");
    expect(formatDailyAxisTick(MAR_1_2200_ET, 200, "en-US")).toBe("Mar 2026");
    expect(formatDailyAxisTick(Date.UTC(2026, 0, 1, 3, 0), 365 * 6, "en-US")).toBe("2025");
    expect(formatTooltipWhen(MAR_1_2200_ET, "daily", 30, "en-US")).toBe("March 1, 2026");
    expect(formatTooltipWhen(MAR_1_2200_ET, "daily", 365 * 6, "en-US")).toBe("March 2026");
  });
});
