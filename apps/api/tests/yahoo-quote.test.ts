import { afterEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { fetchTickerTapeQuotes, parseQuoteResponse } from "../src/yahoo-quote";

describe("parseQuoteResponse", () => {
  test("parses Yahoo v7 benchmark quote fixture", async () => {
    const path = join(import.meta.dir, "fixtures", "minimal-quote.json");
    const raw = await Bun.file(path).text();
    const body = JSON.parse(raw) as unknown;
    const out = parseQuoteResponse(body);
    expect(out.errorMessage).toBeNull();
    expect(out.marketState).toBe("REGULAR");
    expect(out.indexes).toHaveLength(3);
    expect(out.indexes[0]?.symbol).toBe("^GSPC");
    expect(out.indexes[1]?.symbol).toBe("^DJI");
    expect(out.indexes[2]?.symbol).toBe("^IXIC");
  });
});

describe("fetchTickerTapeQuotes", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("backfills incomplete batch quotes from chart metadata", async () => {
    globalThis.fetch = mock((url) => {
      const requestUrl = url.toString();
      if (requestUrl.includes("v7/finance/quote")) {
        return Promise.resolve(
          Response.json({
            quoteResponse: {
              result: [{ symbol: "AAPL", regularMarketPrice: null, regularMarketChangePercent: null }],
              error: null,
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          chart: {
            result: [
              {
                meta: {
                  symbol: "AAPL",
                  regularMarketPrice: 201,
                  chartPreviousClose: 200,
                },
              },
            ],
            error: null,
          },
        }),
      );
    }) as unknown as typeof fetch;

    const result = await fetchTickerTapeQuotes(["AAPL"]);

    expect(result.quotes).toEqual([{ symbol: "AAPL", price: 201, changePercent: 0.5 }]);
  });
});
