import { describe, expect, test } from "bun:test";
import type { PricePoint } from "@stock/shared";
import { formatRangeNetChange, rangeChangeTone, rangeNetChange } from "./rangeNetChange";

const points: PricePoint[] = [
  { timestamp: 1_000, close: 100, volume: null },
  { timestamp: 2_000, close: 110, volume: 50 },
  { timestamp: 3_000, close: 90, volume: null },
  { timestamp: 5_000, close: 120, volume: null },
];

describe("rangeNetChange", () => {
  test("empty series", () => {
    expect(rangeNetChange([], 1_000_000, 5_000_000)).toBeNull();
  });

  test("window in a gap", () => {
    expect(rangeNetChange(points, 3_500_000, 4_500_000)).toBeNull();
  });

  test("exactly one point", () => {
    expect(rangeNetChange(points, 1_000_000, 1_000_000)).toBeNull();
  });

  test("one point with a zero close", () => {
    expect(
      rangeNetChange([{ timestamp: 10, close: 0, volume: null }], 0, 20_000),
    ).toBeNull();
  });

  test("open interior between two bars", () => {
    expect(rangeNetChange(points, 2_000_001, 2_999_999)).toBeNull();
  });

  test("inclusive endpoints, up move", () => {
    expect(rangeNetChange(points, 1_000_000, 2_000_000)).toEqual({
      startClose: 100,
      endClose: 110,
      dollar: 10,
      percent: 10,
    });
  });

  test("full span uses the outer closes", () => {
    expect(rangeNetChange(points, 1_000_000, 5_000_000)).toEqual({
      startClose: 100,
      endClose: 120,
      dollar: 20,
      percent: 20,
    });
  });

  test("down move", () => {
    expect(rangeNetChange(points, 2_000_000, 3_000_000)).toEqual({
      startClose: 110,
      endClose: 90,
      dollar: -20,
      percent: -200 / 11,
    });
  });

  test("reverse arguments", () => {
    const down = rangeNetChange(points, 2_000_000, 3_000_000);
    expect(rangeNetChange(points, 3_000_000, 2_000_000)).toEqual(down);
  });

  test("gap keeps real closes only", () => {
    const result = rangeNetChange(points, 2_500_000, 5_000_000);
    expect(result).toEqual({
      startClose: 90,
      endClose: 120,
      dollar: 30,
      percent: expect.any(Number),
    });
    expect(result!.percent).toBeCloseTo(100 / 3, 10);
  });

  test("window wider than the series", () => {
    const full = rangeNetChange(points, 1_000_000, 5_000_000);
    expect(rangeNetChange(points, 0, 9_000_000)).toEqual(full);
  });

  test("reversed input order", () => {
    const full = rangeNetChange(points, 1_000_000, 5_000_000);
    expect(rangeNetChange([...points].reverse(), 1_000_000, 5_000_000)).toEqual(full);
  });

  test("flat", () => {
    const flat: PricePoint[] = [
      { timestamp: 10, close: 50, volume: null },
      { timestamp: 20, close: 50, volume: null },
    ];
    expect(rangeNetChange(flat, 10_000, 20_000)).toEqual({
      startClose: 50,
      endClose: 50,
      dollar: 0,
      percent: 0,
    });
  });

  test("zero start close", () => {
    const zeroStart: PricePoint[] = [
      { timestamp: 10, close: 0, volume: null },
      { timestamp: 20, close: 5, volume: null },
    ];
    expect(rangeNetChange(zeroStart, 10_000, 20_000)).toEqual({
      startClose: 0,
      endClose: 5,
      dollar: 5,
      percent: null,
    });
  });

  test("negative start close", () => {
    const negativeStart: PricePoint[] = [
      { timestamp: 10, close: -10, volume: null },
      { timestamp: 20, close: -5, volume: null },
    ];
    expect(rangeNetChange(negativeStart, 10_000, 20_000)).toEqual({
      startClose: -10,
      endClose: -5,
      dollar: 5,
      percent: -50,
    });
  });
});

describe("rangeChangeTone", () => {
  test("positive percent", () => {
    expect(
      rangeChangeTone({ startClose: 1, endClose: 2, dollar: 1, percent: 10 }),
    ).toBe("positive");
  });

  test("negative percent", () => {
    expect(
      rangeChangeTone({
        startClose: 110,
        endClose: 90,
        dollar: -20,
        percent: -200 / 11,
      }),
    ).toBe("negative");
  });

  test("zero percent", () => {
    expect(
      rangeChangeTone({ startClose: 50, endClose: 50, dollar: 0, percent: 0 }),
    ).toBe("muted");
  });

  test("null percent positive dollar", () => {
    expect(
      rangeChangeTone({ startClose: 0, endClose: 5, dollar: 5, percent: null }),
    ).toBe("positive");
  });

  test("null percent negative dollar", () => {
    expect(
      rangeChangeTone({ startClose: 0, endClose: -5, dollar: -5, percent: null }),
    ).toBe("negative");
  });

  test("null percent zero dollar", () => {
    expect(
      rangeChangeTone({ startClose: 0, endClose: 0, dollar: 0, percent: null }),
    ).toBe("muted");
  });
});

describe("formatRangeNetChange", () => {
  test("positive with currency", () => {
    expect(
      formatRangeNetChange({ startClose: 100, endClose: 110, dollar: 10, percent: 10 }, "USD"),
    ).toBe("+10.00 USD (+10.00%)");
  });

  test("negative without currency", () => {
    expect(
      formatRangeNetChange({ startClose: 110, endClose: 90, dollar: -20, percent: -200 / 11 }, null),
    ).toBe("-20.00 (-18.18%)");
  });

  test("flat has no sign", () => {
    expect(
      formatRangeNetChange({ startClose: 50, endClose: 50, dollar: 0, percent: 0 }, "USD"),
    ).toBe("0.00 USD (0.00%)");
  });

  test("null percent omits the percent", () => {
    expect(
      formatRangeNetChange({ startClose: 0, endClose: 5, dollar: 5, percent: null }, "USD"),
    ).toBe("+5.00 USD");
  });
});
