import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { handleApiRequest } from "../src/routes";
import type { GetBatchPricesResponse, BatchTickerResult } from "@stock/shared";

describe("handleApiRequest", () => {
  test("rejects invalid ticker with 400", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/prices?ticker=!!!"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("returns 400 for invalid range query", async () => {
    const res = await handleApiRequest(new Request("http://localhost/api/prices?ticker=AAPL&range=invalid"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("health check returns 200", async () => {
    const res = await handleApiRequest(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean };
    expect(j.ok).toBe(true);
  });
});

describe("handleApiRequest with mocked Yahoo fetch", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("returns 200 and series when upstream chart JSON is valid", async () => {
    const fixturePath = join(import.meta.dir, "fixtures", "minimal-chart.json");
    const textFixture = await readFile(fixturePath, "utf-8");
    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (!u.includes("finance.yahoo.com")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      if (u.includes("v8/finance/chart")) {
        return Promise.resolve(
          new Response(textFixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("unsupported yahoo fixture", { status: 404 }));
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(new Request("http://localhost/api/prices?ticker=AAPL"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticker: string; series: { close: number }[]; range?: string };
    expect(body.ticker).toBe("AAPL");
    expect(body.range).toBeUndefined();
    expect(body.series.length).toBe(2);
    expect(body.series[0].close).toBe(198.1);
  });

  test("returns 200 and market context when Yahoo quote JSON is valid", async () => {
    const quotePath = join(import.meta.dir, "fixtures", "minimal-quote.json");
    const quoteFixture = await readFile(quotePath, "utf-8");
    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (!u.includes("finance.yahoo.com")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      if (u.includes("v7/finance/quote")) {
        return Promise.resolve(
          new Response(quoteFixture, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("unsupported yahoo fixture", { status: 404 }));
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(new Request("http://localhost/api/market-context"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { marketState: string | null; indexes: { symbol: string }[] };
    expect(body.marketState).toBe("REGULAR");
    expect(body.indexes.map((i) => i.symbol)).toEqual(["^GSPC", "^DJI", "^IXIC"]);
  });

  test("returns 200 and market context when v7 quote is blocked but v8 chart works", async () => {
    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (!u.includes("finance.yahoo.com")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      if (u.includes("v7/finance/quote")) {
        const blocked = { finance: { result: null, error: { code: "Unauthorized", description: "blocked" } } };
        return Promise.resolve(
          new Response(JSON.stringify(blocked), { status: 200, headers: { "content-type": "application/json" } }),
        );
      }
      if (u.includes("v8/finance/chart")) {
        const m = /\/chart\/([^?]+)/.exec(u);
        const decoded = m ? decodeURIComponent(m[1]) : "^GSPC";
        const short =
          decoded === "^GSPC" ? "S&P 500" : decoded === "^DJI" ? "Dow" : decoded === "^IXIC" ? "NASDAQ" : decoded;
        const body = {
          chart: {
            result: [
              {
                meta: {
                  symbol: decoded,
                  shortName: short,
                  regularMarketPrice: 100,
                  chartPreviousClose: 99,
                  marketState: "REGULAR",
                },
              },
            ],
            error: null,
          },
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("unsupported yahoo fixture", { status: 404 }));
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(new Request("http://localhost/api/market-context"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { marketState: string | null; indexes: { symbol: string; price: number }[] };
    expect(body.marketState).toBe("REGULAR");
    expect(body.indexes.map((i) => i.symbol)).toEqual(["^GSPC", "^DJI", "^IXIC"]);
    expect(body.indexes[0]?.price).toBe(100);
  });
});

describe("/api/prices/batch", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("returns 400 when tickers param is missing", async () => {
    const res = await handleApiRequest(new Request("http://localhost/api/prices/batch"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe("VALIDATION");
    expect(body.error).toContain("tickers");
  });

  test("returns 400 when tickers param is empty", async () => {
    const res = await handleApiRequest(new Request("http://localhost/api/prices/batch?tickers="));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("returns 400 for invalid range in batch request", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/prices/batch?tickers=AAPL,MSFT&range=invalid")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("returns 400 for invalid interval in batch request", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/prices/batch?tickers=AAPL&interval=invalid")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("returns batch results for multiple tickers", async () => {
    const makeChartJson = (ticker: string, price: number) => ({
      chart: {
        result: [
          {
            meta: { symbol: ticker, currency: "USD", regularMarketPrice: price },
            timestamp: [1700000000, 1700086400],
            indicators: { quote: [{ close: [price - 1, price], volume: [100, 200] }] },
          },
        ],
        error: null,
      },
    });

    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (!u.includes("finance.yahoo.com")) {
        return Promise.resolve(new Response("not found", { status: 404 }));
      }
      const tickerMatch = /\/chart\/([^?]+)/.exec(u);
      const ticker = tickerMatch ? decodeURIComponent(tickerMatch[1]).toUpperCase() : "AAPL";
      const prices: Record<string, number> = { AAPL: 200, MSFT: 400 };
      const price = prices[ticker] ?? 100;
      return Promise.resolve(
        new Response(JSON.stringify(makeChartJson(ticker, price)), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(
      new Request("http://localhost/api/prices/batch?tickers=AAPL,MSFT")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetBatchPricesResponse;
    expect(body.results.length).toBe(2);
    const aapl = body.results.find((r) => r.ticker === "AAPL") as BatchTickerResult;
    const msft = body.results.find((r) => r.ticker === "MSFT") as BatchTickerResult;
    expect(aapl.ok).toBe(true);
    expect(msft.ok).toBe(true);
    if (aapl.ok) expect(aapl.data.lastPrice).toBe(200);
    if (msft.ok) expect(msft.data.lastPrice).toBe(400);
  });

  test("returns partial success when one ticker fails", async () => {
    const makeChartJson = (ticker: string, price: number) => ({
      chart: {
        result: [
          {
            meta: { symbol: ticker, currency: "USD", regularMarketPrice: price },
            timestamp: [1700000000],
            indicators: { quote: [{ close: [price], volume: [100] }] },
          },
        ],
        error: null,
      },
    });

    const makeErrorJson = () => ({
      chart: {
        result: null,
        error: { code: "Not Found", description: "No data found for symbol" },
      },
    });

    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      const tickerMatch = /\/chart\/([^?]+)/.exec(u);
      const ticker = tickerMatch ? decodeURIComponent(tickerMatch[1]).toUpperCase() : "";
      if (ticker === "INVALID") {
        return Promise.resolve(
          new Response(JSON.stringify(makeErrorJson()), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(makeChartJson(ticker, 100)), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(
      new Request("http://localhost/api/prices/batch?tickers=AAPL,INVALID")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetBatchPricesResponse;
    expect(body.results.length).toBe(2);
    const aapl = body.results.find((r) => r.ticker === "AAPL");
    const invalid = body.results.find((r) => r.ticker === "INVALID");
    expect(aapl?.ok).toBe(true);
    expect(invalid?.ok).toBe(false);
    if (!invalid?.ok) {
      expect(invalid?.code).toBe("NOT_FOUND");
    }
  });

  test("dedupes repeated tickers", async () => {
    let fetchCount = 0;
    const makeChartJson = (ticker: string) => ({
      chart: {
        result: [
          {
            meta: { symbol: ticker, currency: "USD", regularMarketPrice: 100 },
            timestamp: [1700000000],
            indicators: { quote: [{ close: [100], volume: [100] }] },
          },
        ],
        error: null,
      },
    });

    globalThis.fetch = mock((url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("v8/finance/chart")) {
        fetchCount++;
        const tickerMatch = /\/chart\/([^?]+)/.exec(u);
        const ticker = tickerMatch ? decodeURIComponent(tickerMatch[1]).toUpperCase() : "AAPL";
        return Promise.resolve(
          new Response(JSON.stringify(makeChartJson(ticker)), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(
      new Request("http://localhost/api/prices/batch?tickers=AAPL,aapl,AAPL")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as GetBatchPricesResponse;
    expect(body.results.length).toBe(1);
    expect(fetchCount).toBe(1);
  });
});
