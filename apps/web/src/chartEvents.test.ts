import { describe, expect, test } from "bun:test";
import type { PriceEvents } from "@stock/shared";
import { formatEventDate, groupAriaLabel, mergeMarkers, nearestIndex, visibleChartEvents } from "./chartEvents";

const AAPL_SPLIT_TS = 1598880600; // 2020-08-31 09:30 ET

const events: PriceEvents = {
  dividends: [
    { timestamp: 1597152600, amount: 0.205 },
    { timestamp: 1604932200, amount: 0.205 },
  ],
  splits: [{ timestamp: AAPL_SPLIT_TS, numerator: 4, denominator: 1 }],
};

const ALL: [number, number] = [0, Number.MAX_SAFE_INTEGER];

describe("formatEventDate", () => {
  test("uses the New York exchange date for any viewer zone", () => {
    expect(formatEventDate(AAPL_SPLIT_TS)).toBe("Aug 31, 2020");
    // 2020-09-01 02:00 UTC is still Aug 31 in New York.
    expect(formatEventDate(1598925600)).toBe("Aug 31, 2020");
  });
});

describe("visibleChartEvents", () => {
  test("labels AAPL's 2020 split as 4-for-1, leading with the word Split", () => {
    const split = visibleChartEvents(events, ALL, "USD").find((e) => e.kind === "split")!;
    expect(split.label).toBe("Split 4-for-1 · Aug 31, 2020");
    expect(split.ariaLabel).toBe("Split, 4-for-1, Aug 31, 2020");
    expect(split.t).toBe(AAPL_SPLIT_TS * 1000);
  });

  test("labels dividends with currency amount", () => {
    const [first] = visibleChartEvents(events, ALL, "USD");
    expect(first!.label).toBe("Dividend $0.205 · Aug 11, 2020");
    expect(first!.ariaLabel).toBe("Dividend, $0.205, Aug 11, 2020");
  });

  test("keeps only events inside the visible range, sorted by time", () => {
    const out = visibleChartEvents(events, [AAPL_SPLIT_TS * 1000, AAPL_SPLIT_TS * 1000 + 1], "USD");
    expect(out.map((e) => e.kind)).toEqual(["split"]);
    expect(visibleChartEvents(events, ALL, "USD").map((e) => e.kind)).toEqual(["dividend", "split", "dividend"]);
  });

  test("returns nothing for stocks without events or responses missing the field", () => {
    expect(visibleChartEvents({ dividends: [], splits: [] }, ALL, "USD")).toEqual([]);
    expect(visibleChartEvents(undefined, ALL, "USD")).toEqual([]);
  });
});

describe("nearestIndex", () => {
  test("finds the closest x, preferring the left one on ties", () => {
    const xs = [10, 20, 40];
    expect(nearestIndex(xs, 0)).toBe(0);
    expect(nearestIndex(xs, 15)).toBe(0);
    expect(nearestIndex(xs, 16)).toBe(1);
    expect(nearestIndex(xs, 31)).toBe(2);
    expect(nearestIndex(xs, 99)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe("mergeMarkers", () => {
  const list = visibleChartEvents(events, ALL, "USD");

  test("merges markers within 8px and marks groups containing a split", () => {
    const xOf = (t: number) => (t === list[2]!.t ? 100 : t === list[1]!.t ? 16 : 10);
    const groups = mergeMarkers(list, xOf);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.events).toHaveLength(2);
    expect(groups[0]!.kind).toBe("split");
    expect(groups[0]!.x).toBe(10);
    expect(groupAriaLabel(groups[0]!)).toStartWith("2 events: ");
    expect(groups[1]!.kind).toBe("dividend");
  });

  test("keeps markers more than 8px apart separate", () => {
    const xs = [0, 9, 18];
    let i = 0;
    expect(mergeMarkers(list, () => xs[i++]!)).toHaveLength(3);
  });

  test("skips events the scale cannot place", () => {
    expect(mergeMarkers(list, () => Number.NaN)).toEqual([]);
  });
});
