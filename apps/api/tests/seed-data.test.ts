import { afterEach, describe, expect, test } from "bun:test";
import { getSeedChartResult, getSeedMarketContext, isSeedDataEnabled, SEED_TICKERS } from "../src/seed-data";

describe("isSeedDataEnabled", () => {
  const orig = process.env.USE_SEED_DATA;

  afterEach(() => {
    if (orig === undefined) delete process.env.USE_SEED_DATA;
    else process.env.USE_SEED_DATA = orig;
  });

  test("returns false when unset", () => {
    delete process.env.USE_SEED_DATA;
    expect(isSeedDataEnabled()).toBe(false);
  });

  test("returns true for 1, true, and yes", () => {
    process.env.USE_SEED_DATA = "1";
    expect(isSeedDataEnabled()).toBe(true);
    process.env.USE_SEED_DATA = "true";
    expect(isSeedDataEnabled()).toBe(true);
    process.env.USE_SEED_DATA = "yes";
    expect(isSeedDataEnabled()).toBe(true);
  });
});

describe("getSeedChartResult", () => {
  test("returns stable series for seed tickers", () => {
    for (const ticker of SEED_TICKERS) {
      const result = getSeedChartResult(ticker);
      expect(result.errorMessage).toBeNull();
      expect(result.points.length).toBeGreaterThan(1);
      expect(result.symbol).toBe(ticker);
      expect(result.lastPrice).toBe(198.5);
    }
  });

  test("returns NOT_FOUND shape for unknown tickers", () => {
    const result = getSeedChartResult("MISSING");
    expect(result.errorMessage).toBe("No data for symbol");
    expect(result.points).toEqual([]);
  });
});

describe("getSeedMarketContext", () => {
  test("returns major indexes without error", () => {
    const ctx = getSeedMarketContext();
    expect(ctx.errorMessage).toBeNull();
    expect(ctx.marketState).toBe("REGULAR");
    expect(ctx.indexes.map((i) => i.symbol)).toEqual(["^GSPC", "^DJI", "^IXIC"]);
  });
});
