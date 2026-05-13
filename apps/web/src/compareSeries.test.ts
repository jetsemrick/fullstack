import { describe, expect, test } from "bun:test";
import {
  alignSeriesByTimestamp,
  filterPairBySharedHorizon,
  filterSeriesByHorizon,
} from "./compareSeries";

const mk = (ticker: string, points: { timestamp: number; close: number }[]) => ({
  ticker,
  currency: "USD",
  lastPrice: points[points.length - 1]?.close ?? null,
  series: points.map((p) => ({ ...p, volume: null })),
});

describe("filterPairBySharedHorizon", () => {
  test("uses min of last timestamps as anchor for cutoff", () => {
    const a = mk("A", [
      { timestamp: 10_000, close: 1 },
      { timestamp: 100_000, close: 2 },
    ]);
    const b = mk("B", [
      { timestamp: 10_000, close: 10 },
      { timestamp: 99_900, close: 11 },
    ]);
    const [pa, pb] = filterPairBySharedHorizon(a, b, 1);
    const cutoff = Math.min(100_000, 99_900) - 86400;
    expect(pa.series.map((p) => p.timestamp)).toEqual(a.series.filter((p) => p.timestamp >= cutoff).map((p) => p.timestamp));
    expect(pb.series.map((p) => p.timestamp)).toEqual(b.series.filter((p) => p.timestamp >= cutoff).map((p) => p.timestamp));
    expect(pa.series.map((p) => p.timestamp)).toEqual([100_000]);
    expect(pb.series.map((p) => p.timestamp)).toEqual([99_900]);
  });

  test("Infinity horizon returns series unchanged", () => {
    const a = mk("A", [{ timestamp: 1, close: 1 }]);
    const b = mk("B", [{ timestamp: 2, close: 2 }]);
    expect(filterPairBySharedHorizon(a, b, Infinity)).toEqual([a, b]);
  });
});

describe("alignSeriesByTimestamp", () => {
  test("merges union of timestamps and fills nulls", () => {
    const p = mk("A", [
      { timestamp: 100, close: 1 },
      { timestamp: 200, close: 2 },
    ]);
    const s = mk("B", [
      { timestamp: 150, close: 10 },
      { timestamp: 200, close: 12 },
    ]);
    const rows = alignSeriesByTimestamp(p, s);
    expect(rows.map((r) => r.timestamp)).toEqual([100, 150, 200]);
    expect(rows.map((r) => r.primaryClose)).toEqual([1, null, 2]);
    expect(rows.map((r) => r.secondaryClose)).toEqual([null, 10, 12]);
  });
});

describe("filterSeriesByHorizon", () => {
  test("behaves like single-series window from own last bar", () => {
    const a = mk("A", [
      { timestamp: 1_700_000_000, close: 1 },
      { timestamp: 1_700_086_400, close: 2 },
    ]);
    const sliced = filterSeriesByHorizon(a, 1);
    const cutoff = 1_700_086_400 - 86400;
    expect(sliced.series.every((p) => p.timestamp >= cutoff)).toBe(true);
  });
});
