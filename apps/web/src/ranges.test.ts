import { describe, expect, test } from "bun:test";
import type { GetPricesResponse, PricePoint } from "@stock/shared";
import { RANGES, monthsBeforeSec, percentChange, sliceForRange, type RangeOption } from "./ranges";

const range = (id: RangeOption["id"]) => RANGES.find((r) => r.id === id)!;
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

/** Weekday daily bars at 14:30 UTC (9:30 ET in winter) from `startIso` through `endIso`; close = index + 100. */
function weekdayBars(startIso: string, endIso: string): PricePoint[] {
  const out: PricePoint[] = [];
  for (let t = Date.parse(`${startIso}T14:30:00Z`); t <= Date.parse(`${endIso}T14:30:00Z`); t += 86_400_000) {
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push({ timestamp: t / 1000, close: out.length + 100, volume: null });
  }
  return out;
}

const resp = (series: PricePoint[]): GetPricesResponse => ({ ticker: "X", currency: "USD", lastPrice: null, series });
const yearOfDaily = resp(weekdayBars("2025-11-03", "2026-11-03"));

describe("RANGES", () => {
  test("appear in order Today, 5D, 1M, 6M, YTD, 1Y, 5Y, All", () => {
    expect(RANGES.map((r) => r.label)).toEqual(["Today", "5D", "1M", "6M", "YTD", "1Y", "5Y", "All"]);
    expect(range("max").ariaLabel).toBe("All time");
  });

  test("1M, 6M and YTD reuse the 1Y request, so a cached 1Y series needs no new fetch", () => {
    const key = (r: RangeOption) => `${r.fetch.range}:${r.fetch.interval}`;
    expect(key(range("1m"))).toBe(key(range("1y")));
    expect(key(range("6m"))).toBe(key(range("1y")));
    expect(key(range("ytd"))).toBe(key(range("1y")));
  });

  test("5D fetches 15-minute intraday bars and uses the multi-day chart", () => {
    expect(range("5d").fetch).toEqual({ range: "5d", interval: "15m" });
    expect(range("5d").chart).toBe("multiday");
  });
});

describe("sliceForRange", () => {
  test("1M keeps one calendar month ending at the latest bar", () => {
    const { data } = sliceForRange(yearOfDaily, range("1m"));
    expect(iso(data.series[0]!.timestamp)).toBe("2026-10-05");
    expect(iso(data.series.at(-1)!.timestamp)).toBe("2026-11-03");
  });

  test("6M keeps six calendar months", () => {
    const { data } = sliceForRange(yearOfDaily, range("6m"));
    expect(iso(data.series[0]!.timestamp)).toBe("2026-05-04");
  });

  test("YTD starts on the first trading day of the year and measures % from the prior close", () => {
    const slice = sliceForRange(yearOfDaily, range("ytd"));
    const first = slice.data.series[0]!;
    expect(iso(first.timestamp)).toBe("2026-01-01");
    const prior = yearOfDaily.series.find((p) => iso(p.timestamp) === "2025-12-31")!;
    expect(slice.baseClose).toBe(prior.close);
    const last = slice.data.series.at(-1)!.close;
    expect(percentChange(slice)).toBeCloseTo(((last - prior.close) / prior.close) * 100, 10);
  });

  test("YTD uses the New York calendar, not UTC", () => {
    const series: PricePoint[] = [
      { timestamp: sec("2025-12-31T20:00:00Z"), close: 100, volume: null },
      // 2026-01-01T03:00Z is still Dec 31 in New York.
      { timestamp: sec("2026-01-01T03:00:00Z"), close: 101, volume: null },
      { timestamp: sec("2026-01-02T14:30:00Z"), close: 110, volume: null },
      { timestamp: sec("2026-01-05T14:30:00Z"), close: 121, volume: null },
    ];
    const slice = sliceForRange(resp(series), range("ytd"));
    expect(slice.data.series.map((p) => p.close)).toEqual([110, 121]);
    expect(slice.baseClose).toBe(101);
    expect(percentChange(slice)).toBeCloseTo(((121 - 101) / 101) * 100, 10);
  });

  test("1Y and 5Y trim by days; All keeps everything", () => {
    expect(iso(sliceForRange(yearOfDaily, range("1y")).data.series[0]!.timestamp)).toBe("2025-11-03");
    expect(sliceForRange(yearOfDaily, range("max")).data).toBe(yearOfDaily);
  });

  test("5D passes the intraday series through and % is first to last", () => {
    const series: PricePoint[] = [
      { timestamp: sec("2026-10-28T13:30:00Z"), close: 200, volume: null },
      { timestamp: sec("2026-11-03T20:45:00Z"), close: 210, volume: null },
    ];
    const slice = sliceForRange(resp(series), range("5d"));
    expect(slice.data.series).toEqual(series);
    expect(percentChange(slice)).toBeCloseTo(5, 10);
  });
});

describe("monthsBeforeSec", () => {
  test("clamps to the end of a shorter month", () => {
    expect(new Date(monthsBeforeSec(sec("2026-03-31T14:30:00Z"), 1) * 1000).toISOString()).toBe("2026-02-28T14:30:00.000Z");
  });
});

describe("percentChange", () => {
  test("null for a single point measured from itself", () => {
    expect(percentChange({ data: resp([{ timestamp: 1, close: 5, volume: null }]), baseClose: 5 })).toBeNull();
  });
});
