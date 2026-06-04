import { useEffect, useState } from "react";
import type { GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { filterSeriesByHorizon } from "./filterSeriesByHorizon";

export type CompareLoadError = { ticker: string; message: string };

export function useComparePrices(
  tickers: string[],
  horizon: { range: string; interval: string; days: number },
  enabled: boolean,
): {
  loaded: GetPricesResponse[];
  errors: CompareLoadError[];
  loading: boolean;
} {
  const [loaded, setLoaded] = useState<GetPricesResponse[]>([]);
  const [errors, setErrors] = useState<CompareLoadError[]>([]);
  const [loading, setLoading] = useState(false);

  const tickerKey = tickers.join(",");

  useEffect(() => {
    if (!enabled || tickers.length === 0) {
      setLoaded([]);
      setErrors([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.allSettled(
      tickers.map((ticker) =>
        fetchPrices({ ticker, range: horizon.range, interval: horizon.interval }),
      ),
    ).then((results) => {
      if (cancelled) return;

      const success: GetPricesResponse[] = [];
      const errs: CompareLoadError[] = [];

      results.forEach((result, i) => {
        const ticker = tickers[i]!;
        if (result.status === "fulfilled" && result.value.ok) {
          success.push(filterSeriesByHorizon(result.value.data, horizon.days));
        } else {
          const message =
            result.status === "fulfilled" && !result.value.ok
              ? (result.value.error.error ?? "Request failed")
              : "Request failed";
          errs.push({ ticker, message });
        }
      });

      setLoaded(success);
      setErrors(errs);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tickerKey, horizon.range, horizon.interval, horizon.days, enabled]);

  return { loaded, errors, loading };
}
