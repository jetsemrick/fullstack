import { describe, expect, test } from "bun:test";
import type { ChartRow } from "./priceChartData";
import { downsampleRows } from "./priceChartData";
import { formatRangeBadge, rangeNetChange } from "./rangeNetChange";

const rows2 = (pairs: [number, number][]): ChartRow[] =>
  pairs.map(([t, price]) => ({ t, price }));

describe("rangeNetChange — empty and too-short windows", () => {
  test("empty rows returns null", () => {
    expect(rangeNetChange([], 0, 100)).toBeNull();
  });

  test("one row inside window returns null", () => {
    expect(rangeNetChange(rows2([[5, 100]]), 0, 10)).toBeNull();
  });

  test("startMs === endMs on single point returns null", () => {
    expect(rangeNetChange(rows2([[5, 100]]), 5, 5)).toBeNull();
  });

  test("window covers only first of two rows", () => {
    expect(rangeNetChange(rows2([[0, 100], [10, 110]]), 0, 0)).toBeNull();
  });

  test("window covers only second of two rows", () => {
    expect(rangeNetChange(rows2([[0, 100], [10, 110]]), 10, 10)).toBeNull();
  });

  test("window entirely before first timestamp", () => {
    expect(rangeNetChange(rows2([[10, 100], [20, 110]]), 0, 5)).toBeNull();
  });

  test("window entirely after last timestamp", () => {
    expect(rangeNetChange(rows2([[10, 100], [20, 110]]), 25, 30)).toBeNull();
  });

  test("window in gap between points with no timestamp inside", () => {
    expect(rangeNetChange(rows2([[0, 100], [20, 110]]), 5, 15)).toBeNull();
  });

  test("one finite close plus NaN returns null", () => {
    expect(
      rangeNetChange(
        [
          { t: 0, price: 100 },
          { t: 5, price: Number.NaN },
        ],
        0,
        5,
      ),
    ).toBeNull();
  });

  test("one finite close plus Infinity returns null", () => {
    expect(
      rangeNetChange(
        [
          { t: 0, price: 100 },
          { t: 5, price: Number.POSITIVE_INFINITY },
        ],
        0,
        5,
      ),
    ).toBeNull();
  });

  test("start close 0 returns null", () => {
    expect(rangeNetChange(rows2([[0, 0], [10, 50]]), 0, 10)).toBeNull();
  });
});

describe("rangeNetChange — endpoints, not extrema", () => {
  test("two points up", () => {
    expect(rangeNetChange(rows2([[0, 100], [10, 110]]), 0, 10)).toEqual({
      dollar: 10,
      percent: 10,
    });
  });

  test("two points down uses first close as denominator", () => {
    const r = rangeNetChange(rows2([[0, 110], [10, 100]]), 0, 10);
    expect(r?.dollar).toBe(-10);
    expect(r?.percent).toBeCloseTo((-10 / 110) * 100, 10);
  });

  test("flat", () => {
    expect(rangeNetChange(rows2([[0, 100], [10, 100]]), 0, 10)).toEqual({
      dollar: 0,
      percent: 0,
    });
  });

  test("interior low ignored", () => {
    expect(
      rangeNetChange(rows2([[0, 100], [5, 1], [10, 110]]), 0, 10),
    ).toEqual({ dollar: 10, percent: 10 });
  });

  test("interior high ignored", () => {
    expect(
      rangeNetChange(rows2([[0, 100], [5, 999], [10, 110]]), 0, 10),
    ).toEqual({ dollar: 10, percent: 10 });
  });

  test("excludes series first close", () => {
    const rows = rows2([
      [0, 50],
      [10, 100],
      [20, 110],
    ]);
    expect(rangeNetChange(rows, 10, 20)).toEqual({ dollar: 10, percent: 10 });
  });

  test("excludes series last close", () => {
    const rows = rows2([
      [0, 100],
      [10, 110],
      [20, 200],
    ]);
    expect(rangeNetChange(rows, 0, 10)).toEqual({ dollar: 10, percent: 10 });
  });

  test("points just outside edges unchanged", () => {
    const rows = rows2([
      [0, 100],
      [10, 110],
      [20, 120],
    ]);
    const base = rangeNetChange(rows, 0, 20);
    expect(rangeNetChange(rows, -1, 21)).toEqual(base);
  });

  test("fractional closes", () => {
    const r = rangeNetChange(rows2([[0, 10.25], [10, 10.5]]), 0, 10);
    expect(r?.dollar).toBeCloseTo(0.25, 10);
    expect(r?.percent).toBeCloseTo((0.25 / 10.25) * 100, 10);
  });

  test("large closes", () => {
    const r = rangeNetChange(rows2([[0, 500_000.12], [10, 500_100.12]]), 0, 10);
    expect(r?.dollar).toBeCloseTo(100, 5);
    expect(r?.percent).toBeCloseTo((100 / 500_000.12) * 100, 8);
  });
});

describe("rangeNetChange — drag direction and inclusive edges", () => {
  const rows = rows2([[0, 100], [10, 110]]);

  test("direction independent", () => {
    expect(rangeNetChange(rows, 10, 0)).toEqual(rangeNetChange(rows, 0, 10));
  });

  test("start equal to t includes point", () => {
    expect(rangeNetChange(rows, 0, 10)).not.toBeNull();
  });

  test("end equal to t includes point", () => {
    expect(rangeNetChange(rows, 0, 10)).not.toBeNull();
  });

  test("start one ms after excludes point", () => {
    expect(rangeNetChange(rows, 1, 10)).toBeNull();
  });

  test("end one ms before excludes second point", () => {
    expect(rangeNetChange(rows, 0, 9)).toBeNull();
  });

  test("exactly two adjacent points", () => {
    expect(rangeNetChange(rows, 0, 10)).toEqual({ dollar: 10, percent: 10 });
  });

  test("duplicate timestamps use array order", () => {
    const dup = [
      { t: 5, price: 100 },
      { t: 5, price: 120 },
    ];
    expect(rangeNetChange(dup, 5, 5)).toEqual({ dollar: 20, percent: 20 });
  });
});

describe("rangeNetChange — gaps and intraday bars", () => {
  const gapSeries = rows2([
    [0, 10],
    [2, 20],
    [10, 30],
  ]);

  test("single point in middle of window returns null", () => {
    expect(rangeNetChange(gapSeries, 1, 9)).toBeNull();
  });

  test("full span uses endpoints not middle", () => {
    expect(rangeNetChange(gapSeries, 0, 10)).toEqual({ dollar: 20, percent: 200 });
  });

  test("start in gap uses first in-range bar", () => {
    expect(rangeNetChange(gapSeries, 1, 10)).toEqual({ dollar: 10, percent: 50 });
  });

  test("end in gap uses last in-range bar", () => {
    expect(rangeNetChange(gapSeries, 0, 9)).toEqual({ dollar: 10, percent: 100 });
  });

  test("five-minute bar window", () => {
    const t930 = Date.UTC(2024, 0, 2, 14, 30);
    const t935 = t930 + 5 * 60_000;
    const t940 = t930 + 10 * 60_000;
    const t945 = t930 + 15 * 60_000;
    const intraday = rows2([
      [t930, 100],
      [t935, 101],
      [t940, 102],
      [t945, 103],
    ]);
    expect(rangeNetChange(intraday, t935, t940)).toEqual({ dollar: 1, percent: 1 / 101 * 100 });
  });

  test("window narrower than gap between bars", () => {
    const t0 = 0;
    const t5 = 300_000;
    expect(rangeNetChange(rows2([[t0, 100], [t5, 110]]), 100_000, 200_000)).toBeNull();
  });

  test("last bar through session end with one close", () => {
    const lastBar = 1_000_000;
    const sessionEnd = lastBar + 3_600_000;
    expect(rangeNetChange(rows2([[lastBar, 50]]), lastBar, sessionEnd)).toBeNull();
  });

  test("earlier bar through session end past last bar", () => {
    const first = 900_000;
    const lastBar = 1_000_000;
    const sessionEnd = lastBar + 3_600_000;
    expect(rangeNetChange(rows2([[first, 40], [lastBar, 50]]), first, sessionEnd)).toEqual({
      dollar: 10,
      percent: 25,
    });
  });
});

describe("rangeNetChange — full series vs downsampled rows", () => {
  test("full rows use chronological ends; downsampled differs", () => {
    const full = rows2([
      [10, 100],
      [11, 200],
      [12, 100],
    ]);
    const sampled = downsampleRows(full, 2);
    expect(sampled.length).toBeLessThan(full.length);
    expect(rangeNetChange(full, 10, 11)).toEqual({ dollar: 100, percent: 100 });
    expect(rangeNetChange(sampled, 10, 11)).toBeNull();
  });
});

describe("formatRangeBadge", () => {
  test("positive", () => {
    expect(formatRangeBadge(10, 10)).toEqual({
      text: "+$10.00 (+10.00%)",
      status: "positive",
    });
  });

  test("negative", () => {
    expect(formatRangeBadge(-10, (-10 / 110) * 100)).toEqual({
      text: "-$10.00 (-9.09%)",
      status: "negative",
    });
  });

  test("flat muted", () => {
    expect(formatRangeBadge(0, 0)).toEqual({
      text: "$0.00 (0.00%)",
      status: "muted",
    });
  });

  test("positive dollar tiny percent still positive", () => {
    expect(formatRangeBadge(0.01, 0.0001).status).toBe("positive");
  });

  test("negative dollar with percent rounding to zero still negative", () => {
    expect(formatRangeBadge(-0.01, -0.0001).status).toBe("negative");
  });

  test("zero dollar muted even if percent non-zero", () => {
    expect(formatRangeBadge(0, 5)).toEqual({
      text: "$0.00 (+5.00%)",
      status: "muted",
    });
  });

  test("two fraction digits on dollar", () => {
    expect(formatRangeBadge(1.2, 1).text.startsWith("+$1.20")).toBe(true);
  });

  test("percent rounding half-up", () => {
    const { text } = formatRangeBadge(1, 0.126);
    expect(text).toContain("+0.13%");
  });

  test("thousands separator on large dollar", () => {
    const { text } = formatRangeBadge(1234.5, 1);
    expect(text).toMatch(/1.*234\.50/);
  });
});
