import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseEvents, parseResult } from "../src/yahoo";

async function loadFixture(name: string): Promise<unknown> {
  return JSON.parse(await Bun.file(join(import.meta.dir, "fixtures", name)).text()) as unknown;
}

describe("parseResult events", () => {
  test("returns empty event arrays when the payload has no events", async () => {
    const out = parseResult(await loadFixture("minimal-chart.json"));
    expect(out.events).toEqual({ dividends: [], splits: [] });
  });

  test("parses dividends and splits sorted by date, skipping malformed entries", async () => {
    const out = parseResult(await loadFixture("chart-with-events.json"));
    expect(out.errorMessage).toBeNull();
    expect(out.events.dividends).toEqual([
      { timestamp: 1597152600, amount: 0.205 },
      { timestamp: 1604932200, amount: 0.205 },
    ]);
    expect(out.events.splits).toEqual([{ timestamp: 1598880600, numerator: 4, denominator: 1 }]);
  });

  test("returns empty event arrays on error payloads", () => {
    expect(parseResult(null).events).toEqual({ dividends: [], splits: [] });
  });
});

describe("parseEvents", () => {
  test("tolerates non-object and array shapes", () => {
    expect(parseEvents(undefined)).toEqual({ dividends: [], splits: [] });
    expect(parseEvents({ dividends: [1, 2], splits: "x" })).toEqual({ dividends: [], splits: [] });
  });

  test("drops non-positive split ratios and dividend amounts", () => {
    const out = parseEvents({
      dividends: { a: { date: 1, amount: 0 } },
      splits: { a: { date: 1, numerator: 0, denominator: 1 } },
    });
    expect(out).toEqual({ dividends: [], splits: [] });
  });
});

describe("parseResult", () => {
  test("parses minimal Yahoo chart payload", async () => {
    const path = join(import.meta.dir, "fixtures", "minimal-chart.json");
    const raw = await Bun.file(path).text();
    const body = JSON.parse(raw) as unknown;
    const out = parseResult(body);
    expect(out.errorMessage).toBeNull();
    expect(out.currency).toBe("USD");
    expect(out.symbol).toBe("AAPL");
    expect(out.lastPrice).toBe(198.5);
    expect(out.points).toHaveLength(2);
    expect(out.points[0]).toEqual({
      timestamp: 1700000000,
      close: 198.1,
      volume: 1000000,
    });
    expect(out.points[1]).toEqual({
      timestamp: 1700086400,
      close: 198.5,
      volume: 1100000,
    });
  });

  test("returns error for invalid JSON shape", () => {
    const out = parseResult(null);
    expect(out.errorMessage).toBe("Invalid JSON");
    expect(out.points).toHaveLength(0);
  });

  test("returns error when chart error object present", () => {
    const out = parseResult({
      chart: { error: { description: "Invalid symbol" } },
    });
    expect(out.errorMessage).toBe("Invalid symbol");
    expect(out.points).toHaveLength(0);
  });
});
