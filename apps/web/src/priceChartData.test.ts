import { describe, expect, test } from "bun:test";
import {
  MAX_COMPARE_TICKERS,
  addTickerToList,
  buildCompareChartRows,
  buildCompareSeries,
  buildPriceVolumeRows,
  colorForCompareIndex,
  COMPARE_INDEX_BASE,
  downsampleRows,
  filterSeriesByHorizon,
  formatCompareTooltipValue,
  formatVolumeAxis,
  formatVolumeTooltip,
  indexedValueFromStart,
  removeTickerFromList,
  seriesHasVolume,
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

describe("addTickerToList", () => {
  test("normalizes and appends", () => {
    const r = addTickerToList(["AAPL"], " msft ");
    expect(r.tickers).toEqual(["AAPL", "MSFT"]);
    expect(r.error).toBeUndefined();
  });

  test("rejects duplicate", () => {
    const r = addTickerToList(["AAPL"], "aapl");
    expect(r.tickers).toEqual(["AAPL"]);
    expect(r.error).toMatch(/already/i);
  });

  test("rejects empty", () => {
    const r = addTickerToList(["AAPL"], "  ");
    expect(r.error).toMatch(/enter/i);
  });

  test("rejects over cap", () => {
    const full = Array.from({ length: MAX_COMPARE_TICKERS }, (_, i) => `T${i}`);
    const r = addTickerToList(full, "NEW");
    expect(r.tickers).toHaveLength(MAX_COMPARE_TICKERS);
    expect(r.error).toMatch(/up to/i);
  });
});

describe("removeTickerFromList", () => {
  test("removes normalized ticker", () => {
    expect(removeTickerFromList(["AAPL", "MSFT"], "msft")).toEqual(["AAPL"]);
  });
});

describe("indexedValueFromStart", () => {
  test("baseline is 100", () => {
    expect(indexedValueFromStart(150, 100)).toBe(150);
    expect(indexedValueFromStart(100, 100)).toBe(COMPARE_INDEX_BASE);
  });

  test("null for invalid base", () => {
    expect(indexedValueFromStart(100, 0)).toBeNull();
  });
});

describe("buildCompareChartRows", () => {
  const aapl: GetPricesResponse = {
    ticker: "AAPL",
    currency: "USD",
    lastPrice: 110,
    series: [
      { timestamp: 1, close: 100, volume: null },
      { timestamp: 2, close: 110, volume: null },
    ],
  };

  const msft: GetPricesResponse = {
    ticker: "MSFT",
    currency: "USD",
    lastPrice: 220,
    series: [
      { timestamp: 1, close: 200, volume: null },
      { timestamp: 3, close: 220, volume: null },
    ],
  };

  test("union of timestamps with gaps", () => {
    const rows = buildCompareChartRows([
      { ticker: "AAPL", data: aapl },
      { ticker: "MSFT", data: msft },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ t: 1000, AAPL: 100, MSFT: 100 });
    expect(rows[1]!.t).toBe(2000);
    expect(rows[1]!.AAPL).toBeCloseTo(110, 5);
    expect(rows[1]!.MSFT).toBeNull();
    expect(rows[2]!.t).toBe(3000);
    expect(rows[2]!.AAPL).toBeNull();
    expect(rows[2]!.MSFT).toBeCloseTo(110, 5);
  });

  test("skips series with empty or invalid base", () => {
    const empty: GetPricesResponse = {
      ticker: "BAD",
      currency: null,
      lastPrice: null,
      series: [],
    };
    const rows = buildCompareChartRows([{ ticker: "AAPL", data: aapl }, { ticker: "BAD", data: empty }]);
    expect(rows.every((r) => r.BAD === null || r.BAD === undefined)).toBe(true);
    expect(rows.some((r) => r.AAPL === 100)).toBe(true);
  });

  test("empty when no valid series", () => {
    expect(buildCompareChartRows([])).toEqual([]);
  });
});

describe("buildCompareSeries", () => {
  test("assigns stable colors by order", () => {
    const data: GetPricesResponse = {
      ticker: "A",
      currency: null,
      lastPrice: 1,
      series: [{ timestamp: 1, close: 1, volume: null }],
    };
    const series = buildCompareSeries([
      { ticker: "A", data },
      { ticker: "B", data: { ...data, ticker: "B" } },
    ]);
    expect(series[0]!.color).toBe(colorForCompareIndex(0));
    expect(series[1]!.color).toBe(colorForCompareIndex(1));
  });

  test("uses custom colors when provided", () => {
    const data: GetPricesResponse = {
      ticker: "A",
      currency: null,
      lastPrice: 1,
      series: [{ timestamp: 1, close: 1, volume: null }],
    };
    const series = buildCompareSeries([{ ticker: "A", data }], { A: "#ff00ff" });
    expect(series[0]!.color).toBe("#ff00ff");
  });
});

describe("formatCompareTooltipValue", () => {
  test("includes delta from baseline", () => {
    expect(formatCompareTooltipValue(110)).toContain("+10");
  });
});

describe("filterSeriesByHorizon", () => {
  test("keeps points within horizon", () => {
    const day = 24 * 60 * 60;
    const latest = 1_700_000_000;
    const data: GetPricesResponse = {
      ticker: "X",
      currency: null,
      lastPrice: 2,
      series: [
        { timestamp: latest - 400 * day, close: 1, volume: null },
        { timestamp: latest - 10 * day, close: 2, volume: null },
        { timestamp: latest, close: 3, volume: null },
      ],
    };
    const filtered = filterSeriesByHorizon(data, 30);
    expect(filtered.series).toHaveLength(2);
    expect(filtered.series[0]!.timestamp).toBe(latest - 10 * day);
    expect(filtered.series[1]!.timestamp).toBe(latest);
  });
});
