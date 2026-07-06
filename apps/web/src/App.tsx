import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  MAX_COMPARE_TICKERS,
  addTickerToList,
  buildMultiSeriesChartPayload,
  normalizeTickerInput,
  removeTickerFromList,
  seriesColorVar,
} from "./priceChartData";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatPercentChange(data: GetPricesResponse | null) {
  if (!data || !data.series || data.series.length < 2) return null;
  const first = data.series[0].close;
  const last = data.series[data.series.length - 1].close;
  if (!first) return null;
  const diff = last - first;
  const pct = (diff / first) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    isPositive: pct > 0,
    isNegative: pct < 0,
  };
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" },
];

const PRICE_CACHE_TTL_MS = 60_000;
const priceCache = new Map<string, { data: GetPricesResponse; fetchedAt: number }>();

function priceCacheKey(ticker: string, range: string, interval: string): string {
  return `${ticker}:${range}:${interval}`;
}

function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

type TickerLoadState = {
  data: GetPricesResponse | null;
  error: string | null;
  loading: boolean;
};

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState("");
  const [horizonIndex, setHorizonIndex] = useState<number>(0);
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const [tickerStates, setTickerStates] = useState<Record<string, TickerLoadState>>({});
  const [loadingAny, setLoadingAny] = useState(true);
  const requestIdRef = useRef(0);

  const loadAll = useCallback(
    async (signal: AbortSignal) => {
      const requestId = ++requestIdRef.current;
      setLoadingAny(true);

      setTickerStates((prev) => {
        const next = { ...prev };
        for (const t of tickers) {
          next[t] = {
            data: prev[t]?.data ?? null,
            error: null,
            loading: true,
          };
        }
        return next;
      });

      const horizon = HORIZONS[horizonIndex];

      const results = await Promise.all(
        tickers.map(async (ticker) => {
          const cacheKey = priceCacheKey(ticker, horizon.range, horizon.interval);
          const cached = priceCache.get(cacheKey);
          if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
            return { ticker, ok: true as const, data: cached.data };
          }

          try {
            const res = await fetchPrices({
              ticker,
              range: horizon.range,
              interval: horizon.interval,
              signal,
            });
            if (signal.aborted) return { ticker, aborted: true as const };
            if (!res.ok) {
              return { ticker, ok: false as const, error: res.error.error ?? "Request failed" };
            }
            priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
            return { ticker, ok: true as const, data: res.data };
          } catch (e) {
            if (signal.aborted) return { ticker, aborted: true as const };
            return {
              ticker,
              ok: false as const,
              error: e instanceof Error ? e.message : "Request failed",
            };
          }
        }),
      );

      if (signal.aborted || requestId !== requestIdRef.current) return;

      setTickerStates((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if ("aborted" in r && r.aborted) continue;
          if (r.ok) {
            next[r.ticker] = { data: r.data, error: null, loading: false };
          } else {
            next[r.ticker] = {
              data: prev[r.ticker]?.data ?? null,
              error: r.error,
              loading: false,
            };
          }
        }
        return next;
      });
      setLoadingAny(false);
    },
    [tickers, horizonIndex],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadAll(controller.signal);
    });
    return () => controller.abort();
  }, [loadAll]);

  const chartVariant = horizonIndex === 0 ? "intraday" : "daily";

  const chartPayload = useMemo(() => {
    const successful = tickers
      .map((t) => {
        const state = tickerStates[t];
        if (!state?.data) return null;
        const sliced = filterSeriesByHorizon(state.data, HORIZONS[horizonIndex].days);
        return { ticker: t, data: sliced };
      })
      .filter((x): x is { ticker: string; data: GetPricesResponse } => x != null);

    if (successful.length === 0) return null;

    return buildMultiSeriesChartPayload(successful, {
      downsampleMax: chartVariant === "daily" ? 1_200 : undefined,
    });
  }, [tickers, tickerStates, horizonIndex, chartVariant]);

  const hasChartData = chartPayload != null && chartPayload.rows.length > 0;
  const allFailed =
    tickers.length > 0 &&
    tickers.every((t) => {
      const s = tickerStates[t];
      return s && !s.loading && !s.data && s.error;
    });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const raw = inputTicker.trim();
    if (!raw) return;
    const result = addTickerToList(tickers, raw);
    if (result.rejected === "duplicate") {
      setAddMessage(`${normalizeTickerInput(raw)} is already on the chart`);
      return;
    }
    if (result.rejected === "cap") {
      setAddMessage(`Maximum ${MAX_COMPARE_TICKERS} tickers`);
      return;
    }
    setTickers(result.tickers);
    setInputTicker("");
    setAddMessage(null);
  }

  function removeTicker(ticker: string) {
    setTickers((prev) => removeTickerFromList(prev, ticker));
    setTickerStates((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    setAddMessage(null);
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
          <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
            Add ticker to compare
          </label>
          <div className="search-input-wrapper">
            <input
              id={`${formId}-ticker`}
              name="ticker"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={inputTicker}
              onChange={(e) => {
                setInputTicker(e.target.value.toUpperCase());
                setAddMessage(null);
              }}
              className="search-input"
              placeholder={`Add ticker (e.g. ${DEFAULT_TICKER})`}
              maxLength={32}
            />
            <button id={`${formId}-submit`} type="submit" className="search-btn">
              Add
            </button>
          </div>
          {addMessage ? (
            <p className="search-form__message" role="status">
              {addMessage}
            </p>
          ) : null}
        </form>
      </header>

      <main className="main-content">
        {loadingAny && !hasChartData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!loadingAny && allFailed && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> All tickers failed to load.
          </div>
        )}

        {tickers.length === 0 && !loadingAny && (
          <div className="card empty-banner">
            <p>Add a ticker above to start comparing prices.</p>
          </div>
        )}

        {hasChartData && chartPayload && (
          <div className="card content-card chart-card--loading-context" aria-busy={loadingAny}>
            <div className="content-toolbar">
              <div className="metrics-block">
                <p className="chart-mode-label">Absolute price comparison</p>
                <div className="ticker-chips" role="list" aria-label="Compared tickers">
                  {tickers.map((t) => {
                    const state = tickerStates[t];
                    const colorIndex = tickers.indexOf(t);
                    const seriesColor = seriesColorVar(colorIndex);
                    const onChart = chartPayload.series.some((s) => s.ticker === t);
                    const sliced = state?.data
                      ? filterSeriesByHorizon(state.data, HORIZONS[horizonIndex].days)
                      : null;
                    const pct = sliced ? formatPercentChange(sliced) : null;
                    const chipClass = state?.error
                      ? "ticker-chip ticker-chip--error"
                      : state?.loading
                        ? "ticker-chip ticker-chip--loading"
                        : "ticker-chip";
                    return (
                      <div
                        key={t}
                        className={chipClass}
                        role="listitem"
                        style={{ borderColor: onChart ? seriesColor : undefined }}
                      >
                        <span className="ticker-chip__symbol" style={{ color: onChart ? seriesColor : undefined }}>
                          {t}
                        </span>
                        {state?.loading ? (
                          <span className="ticker-chip__meta muted">Loading…</span>
                        ) : state?.error ? (
                          <span className="ticker-chip__meta negative" title={state.error}>
                            Failed
                          </span>
                        ) : sliced ? (
                          <>
                            <span className="ticker-chip__meta">
                              {formatLast(sliced.lastPrice, sliced.currency)}
                            </span>
                            {pct ? (
                              <span
                                className={`ticker-chip__meta ${pct.isPositive ? "positive" : pct.isNegative ? "negative" : "muted"}`}
                              >
                                {pct.text}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="ticker-chip__remove"
                          onClick={() => removeTicker(t)}
                          aria-label={`Remove ${t}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="horizon-buttons" role="group" aria-label="Chart time horizon">
                  {HORIZONS.map((h, i) => (
                    <button
                      key={h.label}
                      type="button"
                      className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                      aria-pressed={i === horizonIndex}
                      onClick={() => setHorizonIndex(i)}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="chart-container" aria-label="Multi-ticker price comparison chart">
              <PriceChart rows={chartPayload.rows} series={chartPayload.series} variant={chartVariant} />
            </div>
            {loadingAny ? (
              <div className="chart-loading-overlay" role="status">
                Loading latest data...
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
