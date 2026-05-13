import { describe, expect, test } from "bun:test";
import { alignSeriesByTimestamp } from "./compareSeries";
import { buildComparisonPricesCsv } from "./exportCsv";
import type { GetPricesResponse } from "@stock/shared";

const mk = (ticker: string, series: GetPricesResponse["series"]): GetPricesResponse => ({
  ticker,
  currency: ticker === "A" ? "USD" : "EUR",
  lastPrice: 1,
  series,
});

describe("buildComparisonPricesCsv", () => {
  test("outputs aligned rows with empty cells for gaps", () => {
    const a = mk("A", [
      { timestamp: 100, close: 1, volume: null },
      { timestamp: 200, close: 2, volume: null },
    ]);
    const b = mk("B", [{ timestamp: 150, close: 10, volume: null }, { timestamp: 200, close: 12, volume: null }]);
    const rows = alignSeriesByTimestamp(a, b);
    const csv = buildComparisonPricesCsv({
      rows,
      primaryTicker: a.ticker,
      secondaryTicker: b.ticker,
      primaryCurrency: a.currency,
      secondaryCurrency: b.currency,
    });
    const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toBe("date,timestamp_unix,A_close,B_close,primary_currency,compare_currency");
    expect(lines[1]).toBe("1970-01-01,100,1,,USD,EUR");
    expect(lines[2]).toBe("1970-01-01,150,,10,USD,EUR");
    expect(lines[3]).toBe("1970-01-01,200,2,12,USD,EUR");
  });
});
