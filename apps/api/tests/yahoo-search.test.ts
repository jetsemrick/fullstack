import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { SEARCH_MAX_RESULTS } from "@stock/shared";
import { parseSearchResponse } from "../src/yahoo-search";

describe("parseSearchResponse", () => {
  test("puts NVDA first for 'nvidia' and drops futures", async () => {
    const raw = await Bun.file(join(import.meta.dir, "fixtures", "search-nvidia.json")).text();
    const out = parseSearchResponse(JSON.parse(raw) as unknown);
    expect(out.errorMessage).toBeNull();
    expect(out.results[0]).toEqual({ symbol: "NVDA", name: "NVIDIA Corporation", type: "EQUITY", exchange: "NASDAQ" });
    expect(out.results.map((r) => r.symbol)).toEqual(["NVDA", "NVDX", "NVDA.TO", "NVD.DE", "NVDQ"]);
  });

  test("keeps only stocks, ETFs, and indexes, capped and deduped", () => {
    const types = ["EQUITY", "ETF", "INDEX", "MUTUALFUND", "CRYPTOCURRENCY", "OPTION", "FUTURE", "CURRENCY"];
    const quotes = Array.from({ length: 30 }, (_, i) => ({
      symbol: `S${i % 15}`,
      shortname: `Co ${i}`,
      quoteType: types[i % types.length],
    }));
    const out = parseSearchResponse({ quotes });
    expect(out.results.length).toBeLessThanOrEqual(SEARCH_MAX_RESULTS);
    expect(out.results.every((r) => ["EQUITY", "ETF", "INDEX"].includes(r.type))).toBe(true);
    expect(new Set(out.results.map((r) => r.symbol)).size).toBe(out.results.length);
  });

  test("returns exactly SEARCH_MAX_RESULTS when more stocks match", () => {
    const quotes = Array.from({ length: 20 }, (_, i) => ({ symbol: `T${i}`, shortname: `Co ${i}`, quoteType: "EQUITY" }));
    expect(parseSearchResponse({ quotes }).results).toHaveLength(SEARCH_MAX_RESULTS);
  });

  test("skips malformed rows and falls back from longname to shortname to symbol", () => {
    const out = parseSearchResponse({
      quotes: [
        null,
        "x",
        { quoteType: "EQUITY" },
        { symbol: "<script>", quoteType: "EQUITY" },
        { symbol: "abc", quoteType: "EQUITY", shortname: "  ABC   Corp  " },
        { symbol: "^GSPC", quoteType: "INDEX" },
      ],
    });
    expect(out.results).toEqual([
      { symbol: "ABC", name: "ABC Corp", type: "EQUITY", exchange: null },
      { symbol: "^GSPC", name: "^GSPC", type: "INDEX", exchange: null },
    ]);
  });

  test("reports an error for non-object bodies or missing quotes", () => {
    expect(parseSearchResponse(null).errorMessage).not.toBeNull();
    expect(parseSearchResponse({ news: [] }).errorMessage).not.toBeNull();
  });
});
