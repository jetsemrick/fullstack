import { afterEach, describe, expect, mock, test } from "bun:test";
import { SP_TICKER_TAPE_SYMBOLS } from "@stock/shared";
import { fetchTickerTape } from "./api";

const originalFetch = globalThis.fetch;
const invalidTickerTapeResponse = {
  ok: false,
  status: 500,
  error: { error: "Invalid ticker tape response", code: "INTERNAL" },
};

function quote(symbol: string, index: number) {
  return {
    symbol,
    price: 100 + index,
    changePercent: index / 10,
  };
}

function tickerTapeBody(symbols: readonly string[]) {
  return {
    quotes: symbols.map(quote),
  };
}

function mockTickerTapeFetch(body: unknown) {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  ) as unknown as typeof fetch;
}

describe("fetchTickerTape", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns ordered curated ticker tape quotes", async () => {
    const symbols = SP_TICKER_TAPE_SYMBOLS.slice(0, 10);
    const body = tickerTapeBody(symbols);
    mockTickerTapeFetch(body);

    const result = await fetchTickerTape();

    expect(result).toEqual({ ok: true, data: body });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/ticker-tape", { signal: undefined });
  });

  const malformedCases = [
    ["fewer than 10 quotes", SP_TICKER_TAPE_SYMBOLS.slice(0, 9)],
    ["a duplicate symbol", [...SP_TICKER_TAPE_SYMBOLS.slice(0, 9), SP_TICKER_TAPE_SYMBOLS[0]]],
    ["a non-curated symbol", [...SP_TICKER_TAPE_SYMBOLS.slice(0, 9), "IBM"]],
    ["out-of-order symbols", [SP_TICKER_TAPE_SYMBOLS[1], SP_TICKER_TAPE_SYMBOLS[0], ...SP_TICKER_TAPE_SYMBOLS.slice(2, 10)]],
  ] as const;

  for (const [name, symbols] of malformedCases) {
    test(`returns invalid-response result for ${name}`, async () => {
      mockTickerTapeFetch(tickerTapeBody(symbols));

      const result = await fetchTickerTape();

      expect(result).toEqual(invalidTickerTapeResponse);
    });
  }
});
