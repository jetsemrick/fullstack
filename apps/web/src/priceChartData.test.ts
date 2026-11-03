import { describe, expect, test } from "bun:test";
import {
  buildPriceVolumeRows,
  downsampleRows,
  seriesHasVolume,
  formatVolumeAxis,
  formatVolumeTooltip,
  formatLogAxisPrice,
  logPlottableRows,
  logScaleAxis,
} from "./priceChartData";
import type { GetPricesResponse, PricePoint } from "@stock/shared";

describe("seriesHasVolume", () => {
  test("false when empty", () => {
    expect(seriesHasVolume([])).toBe(false);
  });
  test("false when all null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, volume: null },
      { timestamp: 2, close: 2, volume: null },
    ];
    expect(seriesHasVolume(s)).toBe(false);
  });
  test("true when any non-null", () => {
    const s: PricePoint[] = [
      { timestamp: 1, close: 1, volume: null },
      { timestamp: 2, close: 2, volume: 1_000_000 },
    ];
    expect(seriesHasVolume(s)).toBe(true);
  });
});

describe("buildPriceVolumeRows", () => {
  test("maps timestamps and volumeBar", () => {
    const data: GetPricesResponse = {
      ticker: "X",
      currency: "USD",
      lastPrice: 10,
      series: [
        { timestamp: 1000, close: 1.5, volume: 100 },
        { timestamp: 2000, close: 2, volume: null },
      ],
    };
    const rows = buildPriceVolumeRows(data);
    expect(rows).toEqual([
      { t: 1_000_000, price: 1.5, volume: 100, volumeBar: 100 },
      { t: 2_000_000, price: 2, volume: null, volumeBar: 0 },
    ]);
  });
});

describe("formatVolumeAxis", () => {
  test("compact suffixes", () => {
    expect(formatVolumeAxis(500)).toBe("500");
    expect(formatVolumeAxis(12_000)).toBe("12.0K");
    expect(formatVolumeAxis(3_400_000)).toBe("3.4M");
    expect(formatVolumeAxis(2_200_000_000)).toBe("2.2B");
  });
});

describe("formatVolumeTooltip", () => {
  test("em dash for null", () => {
    expect(formatVolumeTooltip(null)).toBe("—");
  });
  test("includes digits for finite values", () => {
    expect(formatVolumeTooltip(1_234_567)).toMatch(/1.*234.*567/);
  });
});

describe("downsampleRows", () => {
  test("preserves endpoints and bucket extrema", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      t: i,
      price: i === 5 ? 100 : i === 14 ? -10 : i,
    }));

    const sampled = downsampleRows(rows, 6);

    expect(sampled[0]).toEqual(rows[0]);
    expect(sampled[sampled.length - 1]).toEqual(rows[rows.length - 1]);
    expect(sampled).toContainEqual(rows[5]);
    expect(sampled).toContainEqual(rows[14]);
    expect(sampled.length).toBeLessThan(rows.length);
  });
});

describe("logScaleAxis", () => {
  const isRound = (n: number) => {
    const m = n / 10 ** Math.floor(Math.log10(n));
    return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8].some((r) => Math.abs(m - r) < 1e-9);
  };

  test("null for non-positive or non-finite input", () => {
    expect(logScaleAxis(0, 10)).toBeNull();
    expect(logScaleAxis(-1, 10)).toBeNull();
    expect(logScaleAxis(Number.NaN, 10)).toBeNull();
    expect(logScaleAxis(1, Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("AAPL-like all-time span: domain covers data, ticks are round and bounded", () => {
    const axis = logScaleAxis(0.049, 259.02)!;
    expect(axis.domain[0]).toBeLessThanOrEqual(0.049);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(259.02);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(4);
    expect(axis.ticks.length).toBeLessThanOrEqual(10);
    expect(axis.ticks.every(isRound)).toBe(true);
    expect(axis.ticks).toContain(1);
    expect(axis.ticks).toContain(100);
  });

  test("narrow span uses a denser set of round ticks", () => {
    const axis = logScaleAxis(120, 260)!;
    expect(axis.domain[0]).toBeLessThanOrEqual(120);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(260);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(4);
    expect(axis.ticks.every(isRound)).toBe(true);
  });

  test("ticks are evenly spaced in log space within a mantissa set (equal % = equal height)", () => {
    const axis = logScaleAxis(1, 1000)!;
    const decades = axis.ticks.filter((t) => isRound(t) && Math.log10(t) % 1 === 0);
    const gaps = decades.slice(1).map((t, i) => Math.log10(t) - Math.log10(decades[i]!));
    expect(gaps.every((g) => Math.abs(g - 1) < 1e-9)).toBe(true);
  });

  test("huge spans fall back to stepped powers of ten", () => {
    const axis = logScaleAxis(0.0001, 1e9)!;
    expect(axis.ticks.length).toBeLessThanOrEqual(10);
    expect(axis.ticks.every((t) => Number.isFinite(t) && t > 0)).toBe(true);
  });

  test("flat series still gets a non-zero domain", () => {
    const axis = logScaleAxis(5, 5)!;
    expect(axis.domain[1]).toBeGreaterThan(axis.domain[0]);
    expect(axis.ticks.every((t) => !Number.isNaN(t))).toBe(true);
  });
});

describe("logPlottableRows", () => {
  test("drops non-positive and non-finite prices", () => {
    const rows = [
      { t: 1, price: 0 },
      { t: 2, price: -3 },
      { t: 3, price: Number.NaN },
      { t: 4, price: 2 },
    ];
    expect(logPlottableRows(rows)).toEqual([{ t: 4, price: 2 }]);
  });
});

describe("formatLogAxisPrice", () => {
  test("drops trailing zeros and keeps sub-dollar precision", () => {
    expect(formatLogAxisPrice(100)).toBe("100");
    expect(formatLogAxisPrice(2.5)).toBe("2.5");
    expect(formatLogAxisPrice(0.012)).toBe("0.012");
  });
});
