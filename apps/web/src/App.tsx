import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import { SERIES_COLORS } from "./priceChartData";
import "./app.css";

const MAX_COMPARE_TICKERS = 5;

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
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [seriesByTicker, setSeriesByTicker] = useState<Record<string, GetPricesResponse>>({});
  const [failedTickers, setFailedTickers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const seriesByTickerRef = useRef(seriesByTicker);
  seriesByTickerRef.current = seriesByTicker;

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setFatalError(null);
    setFailedTickers({});

    const horizon = HORIZONS[horizonIndex];
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;

    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const cacheKey = priceCacheKey(ticker, fetchRange, horizon.interval);
        const cached = priceCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
          return { ticker, data: cached.data };
        }

        const res = await fetchPrices({
          ticker,
          range: fetchRange,
          interval: horizon.interval,
          signal,
        });
        if (!res.ok) {
          throw new Error(res.error.error ?? "Request failed");
        }
        priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
        return { ticker, data: res.data };
      }),
    );

    if (signal.aborted || requestId !== requestIdRef.current) return;

    const nextSeries: Record<string, GetPricesResponse> = {};
    const nextFailed: Record<string, string> = {};
    let successCount = 0;

    for (let i = 0; i < results.length; i++) {
      const ticker = tickers[i]!;
      const result = results[i]!;
      if (result.status === "fulfilled") {
        nextSeries[ticker] = result.value.data;
        successCount++;
      } else {
        const message =
          result.reason instanceof Error ? result.reason.message : "Request failed";
        nextFailed[ticker] = message;
        if (!nextSeries[ticker] && seriesByTickerRef.current[ticker]) {
          successCount++;
        }
      }
    }

    setLoading(false);
    setSeriesByTicker((prev) => {
      const merged = { ...prev, ...nextSeries };
      for (const ticker of Object.keys(nextFailed)) {
        if (!nextSeries[ticker] && prev[ticker]) {
          merged[ticker] = prev[ticker]!;
        }
      }
      return merged;
    });
    setFailedTickers(nextFailed);

    if (successCount === 0) {
      const firstFailure = Object.values(nextFailed)[0] ?? "Request failed";
      setFatalError(firstFailure);
    }
  }, [tickers, horizonIndex]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const displaySeries = useMemo(() => {
    const horizonDays = HORIZONS[horizonIndex]!.days;
    return tickers
      .map((ticker) => seriesByTicker[ticker])
      .filter((data): data is GetPricesResponse => Boolean(data))
      .map((data) => filterSeriesByHorizon(data, horizonDays));
  }, [tickers, seriesByTicker, horizonIndex]);

  const primaryTicker = tickers[0] ?? DEFAULT_TICKER;
  const primaryData = displaySeries[0] ?? seriesByTicker[primaryTicker] ?? null;
  const compareMode = tickers.length >= 2;
  const hasChartData = displaySeries.length > 0;
  const partialErrors = Object.entries(failedTickers);

  const lastPriceDisplay = primaryData?.lastPrice ?? null;
  const currencyDisplay = primaryData?.currency ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCapMessage(null);
    const t = inputTicker.trim().toUpperCase();
    if (!t) return;

    if (tickers.includes(t)) {
      setInputTicker("");
      return;
    }

    if (tickers.length >= MAX_COMPARE_TICKERS) {
      setCapMessage(`You can compare up to ${MAX_COMPARE_TICKERS} tickers.`);
      return;
    }

    setTickers((prev) => [...prev, t]);
    setInputTicker("");
  }

  function removeTicker(ticker: string) {
    if (tickers.length <= 1) return;
    setTickers((prev) => prev.filter((t) => t !== ticker));
    setFailedTickers((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
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
              onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
              className="search-input"
              placeholder={`Add ticker, e.g. MSFT`}
              maxLength={32}
            />
            <button
              id={`${formId}-submit`}
              type="submit"
              className="search-btn"
              disabled={loading && !hasChartData}
            >
              Add
            </button>
          </div>
        </form>
      </header>

      <main className="main-content">
        {loading && !hasChartData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!loading && fatalError && !hasChartData && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {fatalError}
          </div>
        )}

        {hasChartData && (
          <>
            {capMessage && (
              <div className="card cap-banner" role="status">
                {capMessage}
              </div>
            )}
            {partialErrors.length > 0 && (
              <div className="card partial-error-banner" role="status">
                Could not load:{" "}
                {partialErrors.map(([ticker, message]) => `${ticker} (${message})`).join("; ")}
              </div>
            )}
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="ticker-chips" role="list" aria-label="Compared tickers">
                    {tickers.map((ticker, i) => {
                      const failed = failedTickers[ticker];
                      const loaded = Boolean(seriesByTicker[ticker]);
                      return (
                        <span
                          key={ticker}
                          className={`ticker-chip${failed ? " ticker-chip--failed" : ""}${!loaded && loading ? " ticker-chip--pending" : ""}`}
                          role="listitem"
                          style={{ "--chip-color": SERIES_COLORS[i % SERIES_COLORS.length] } as CSSProperties}
                        >
                          <span className="ticker-chip__dot" aria-hidden="true" />
                          <span className="ticker-chip__label">{ticker}</span>
                          {tickers.length > 1 && (
                            <button
                              type="button"
                              className="ticker-chip__remove"
                              aria-label={`Remove ${ticker}`}
                              onClick={() => removeTicker(ticker)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{compareMode ? "Compare" : primaryTicker}</h2>
                    {!compareMode && (
                      <>
                        <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                        {(() => {
                          const percentChange = formatPercentChange(primaryData);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive
                            ? "positive"
                            : percentChange.isNegative
                              ? "negative"
                              : "muted";
                          return (
                            <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>
                          );
                        })()}
                      </>
                    )}
                    {compareMode && (
                      <span className="metric-badge muted">Indexed (100 = start)</span>
                    )}
                  </div>
                  <div className="horizon-buttons">
                    {HORIZONS.map((h, i) => (
                      <button
                        key={h.label}
                        className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                        onClick={() => setHorizonIndex(i)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-container" aria-label="Price chart">
                <PriceChart
                  series={displaySeries}
                  comparing={compareMode}
                  mode={compareMode ? "indexed" : "absolute"}
                  variant={horizonIndex === 0 && !compareMode ? "intraday" : "daily"}
                  tickerOrder={tickers}
                />
              </div>
              {loading && (
                <div className="chart-loading-overlay" role="status">
                  Loading latest data...
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <ReportBug />
    </div>
  );
}
