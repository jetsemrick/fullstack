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
      return Promise.resolve(
        new Response(textFixture, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;

    const res = await handleApiRequest(new Request("http://localhost/api/prices?ticker=AAPL"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticker: string; series: { close: number }[]; range?: string };
    expect(body.ticker).toBe("AAPL");
    expect(body.range).toBeUndefined();
    expect(body.series.length).toBe(2);
    expect(body.series[0].close).toBe(198.1);
  });
});
