import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SEARCH_MAX_RESULTS, type SearchResponse } from "@stock/shared";
import { handleApiRequest } from "../src/routes";
import { clearSearchCache } from "../src/yahoo-search";

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

  test("report-bug rejects empty message with 400", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/report-bug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "   " }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION");
  });

  test("report-bug returns 503 when CURSOR_API_KEY is missing", async () => {
    const prev = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    try {
      const res = await handleApiRequest(
        new Request("http://localhost/api/report-bug", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Fix the chart legend" }),
        }),
      );
      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("CONFIG");
    } finally {
      if (prev === undefined) delete process.env.CURSOR_API_KEY;
      else process.env.CURSOR_API_KEY = prev;
    }
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

describe("GET /api/search", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    clearSearchCache();
  });

  const rejected: [string, string][] = [
    ["missing q", "http://localhost/api/search"],
    ["empty q", "http://localhost/api/search?q="],
    ["whitespace-only q", "http://localhost/api/search?q=%20%20%09"],
    ["65-character q", `http://localhost/api/search?q=${"a".repeat(65)}`],
    ["very long q", `http://localhost/api/search?q=${"a".repeat(5000)}`],
    ["angle brackets", "http://localhost/api/search?q=%3Cscript%3E"],
    ["control character", "http://localhost/api/search?q=nv%00idia"],
    ["semicolon", "http://localhost/api/search?q=a;b"],
  ];
  for (const [name, url] of rejected) {
    test(`rejects ${name} with 400 without calling Yahoo`, async () => {
      const upstream = mock(() => Promise.resolve(new Response("{}")));
      globalThis.fetch = upstream as unknown as typeof fetch;
      const res = await handleApiRequest(new Request(url));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("VALIDATION");
      expect(upstream).not.toHaveBeenCalled();
    });
  }

  test("accepts a 64-character query", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ quotes: [] })))) as unknown as typeof fetch;
    const res = await handleApiRequest(new Request(`http://localhost/api/search?q=${"a".repeat(64)}`));
    expect(res.status).toBe(200);
  });

  test("normalizes the query before calling Yahoo and returns NVDA first for 'nvidia'", async () => {
    const fixture = await readFile(join(import.meta.dir, "fixtures", "search-nvidia.json"), "utf-8");
    let upstreamUrl = "";
    globalThis.fetch = mock((url) => {
      upstreamUrl = typeof url === "string" ? url : url.toString();
      return Promise.resolve(new Response(fixture, { status: 200 }));
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(new Request("http://localhost/api/search?q=%20%20nvidia%20%20%20corp%20"));
    expect(res.status).toBe(200);
    expect(new URL(upstreamUrl).hostname).toBe("query1.finance.yahoo.com");
    expect(new URL(upstreamUrl).searchParams.get("q")).toBe("nvidia corp");
    const body = (await res.json()) as SearchResponse;
    expect(body.query).toBe("nvidia corp");
    expect(body.results[0]?.symbol).toBe("NVDA");
    expect(body.results.length).toBeLessThanOrEqual(SEARCH_MAX_RESULTS);
    expect(body.results.some((r) => r.symbol.endsWith("=F"))).toBe(false);
  });

  test("accepts company-name punctuation and non-Latin letters", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ quotes: [] })))) as unknown as typeof fetch;
    for (const q of ["AT&T", "Johnson & Johnson", "Moody's", "BRK.B", "^GSPC", "Nestlé", "トヨタ"]) {
      const res = await handleApiRequest(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`));
      expect(res.status).toBe(200);
    }
  });

  test("returns 502 UPSTREAM when Yahoo fails, so the client can fall back to exact-symbol lookup", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response("rate limited", { status: 429 }))) as unknown as typeof fetch;
    const res = await handleApiRequest(new Request("http://localhost/api/search?q=nvidia"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("UPSTREAM");
  });

  test("returns 502 when the Yahoo request throws", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
    const res = await handleApiRequest(new Request("http://localhost/api/search?q=nvidia"));
    expect(res.status).toBe(502);
  });

  test("serves repeat queries from cache", async () => {
    const upstream = mock(() => Promise.resolve(new Response(JSON.stringify({ quotes: [] }))));
    globalThis.fetch = upstream as unknown as typeof fetch;
    await handleApiRequest(new Request("http://localhost/api/search?q=Apple"));
    await handleApiRequest(new Request("http://localhost/api/search?q=apple"));
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
