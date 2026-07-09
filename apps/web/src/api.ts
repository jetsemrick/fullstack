import type { ApiErrorBody, GetPricesResponse, MarketContextResponse, TapeQuotesResponse } from "@stock/shared";

export async function fetchPrices(params: {
  ticker: string;
  /** Yahoo chart range, e.g. `max`, `1d` */
  range?: string;
  /** Yahoo chart interval, e.g. `1d`, `5m` */
  interval?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: GetPricesResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const q = new URLSearchParams({ ticker: params.ticker });
  if (params.range) q.set("range", params.range);
  if (params.interval) q.set("interval", params.interval);
  const res = await fetch(`/api/prices?${q.toString()}`, { signal: params.signal });
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

export async function fetchTapeQuotes(): Promise<
  { ok: true; data: TapeQuotesResponse } | { ok: false; error: ApiErrorBody; status: number }
> {
  const res = await fetch(`/api/tape-quotes`);
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
  return { ok: true, data: json as TapeQuotesResponse };
}
