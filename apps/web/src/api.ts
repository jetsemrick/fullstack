import type { ApiErrorBody, GetPricesResponse } from "@stock/shared";

export async function fetchPrices(params: {
  ticker: string;
}): Promise<{ ok: true; data: GetPricesResponse } | { ok: false; error: ApiErrorBody; status: number }> {
  const q = new URLSearchParams({ ticker: params.ticker });
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
