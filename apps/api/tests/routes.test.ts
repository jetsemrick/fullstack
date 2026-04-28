import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { handleApiRequest } from "../src/routes";

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
