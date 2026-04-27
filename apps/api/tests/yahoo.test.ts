import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseResult } from "../src/yahoo";

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
