import type { ApiErrorBody, GetPricesResponse, MarketContextResponse } from "@stock/shared";

export async function fetchPrices(params: {
  ticker: string;
  /** Yahoo chart range, e.g. `max`, `1d` */
  range?: string;
  /** Yahoo chart interval, e.g. `1d`, `5m` */
  interval?: string;
}): Promise<{ ok: true; data: GetPricesResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const q = new URLSearchParams({ ticker: params.ticker });
  if (params.range) q.set("range", params.range);
  if (params.interval) q.set("interval", params.interval);
  const res = await fetch(`/api/prices?${q.toString()}`);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, data: json as GetPricesResponse };
}

export type TickerFetchResult =
  | { ticker: string; ok: true; data: GetPricesResponse }
  | { ticker: string; ok: false; error: ApiErrorBody; status: number };

export async function fetchPricesForTickers(
  tickers: readonly string[],
  params: { range?: string; interval?: string },
): Promise<TickerFetchResult[]> {
  return Promise.all(
    tickers.map(async (ticker) => {
      const res = await fetchPrices({ ticker, ...params });
      if (res.ok) return { ticker, ok: true as const, data: res.data };
      return { ticker, ok: false as const, error: res.error, status: res.status };
    }),
  );
}

export async function fetchMarketContext(): Promise<
  { ok: true; data: MarketContextResponse } | { ok: false; error: ApiErrorBody; status: number }
> {
  const res = await fetch(`/api/market-context`);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: { error: "Invalid response", code: "INTERNAL" },
    };
  }
  if (!res.ok) {
    const err = json as ApiErrorBody;
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true, data: json as MarketContextResponse };
}
