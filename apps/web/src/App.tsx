import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  COMPARE_SERIES_COLORS,
  DEFAULT_COMPARE_NORMALIZATION,
  DEFAULT_TICKER,
  MAX_COMPARE_TICKERS,
  type CompareNormalization,
  type GetPricesResponse,
} from "@stock/shared";
import { fetchPrices } from "./api";
import { alignCompareSeries } from "./compareSeries";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatPercentChange(data: GetPricesResponse | null) {
  if (!data || !data.series || data.series.length < 2) return null;
  const first = data.series[0]!.close;
  const last = data.series[data.series.length - 1]!.close;
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

function seriesColor(index: number): string {
  return COMPARE_SERIES_COLORS[index % COMPARE_SERIES_COLORS.length]!;
}

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(0);
  const [normalization, setNormalization] = useState<CompareNormalization>(DEFAULT_COMPARE_NORMALIZATION);

  const [tickerData, setTickerData] = useState<Map<string, GetPricesResponse>>(new Map());
  const [tickerErrors, setTickerErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const primaryTicker = tickers[0] ?? DEFAULT_TICKER;
  const isCompareMode = tickers.length >= 2;
  const chartVariant = horizonIndex === 0 ? "intraday" as const : "daily" as const;

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setGlobalError(null);

    const horizon = HORIZONS[horizonIndex]!;
    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const cacheKey = priceCacheKey(ticker, horizon.range, horizon.interval);
        const cached = priceCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
          return { ticker, data: cached.data };
        }

        const res = await fetchPrices({
          ticker,
          range: horizon.range,
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

    const nextData = new Map<string, GetPricesResponse>();
    const nextErrors = new Map<string, string>();

    for (let i = 0; i < results.length; i++) {
      const ticker = tickers[i]!;
      const result = results[i]!;
      if (result.status === "fulfilled") {
        nextData.set(ticker, result.value.data);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "Request failed";
        if (message !== "The operation was aborted.") {
          nextErrors.set(ticker, message);
        }
      }
    }

    setTickerData(nextData);
    setTickerErrors(nextErrors);
    setLoading(false);

    if (nextData.size === 0 && nextErrors.size > 0) {
      setGlobalError("Could not load any ticker data.");
    }
  }, [tickers, horizonIndex]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const slicedByTicker = useMemo(() => {
    const horizonDays = HORIZONS[horizonIndex]!.days;
    const out = new Map<string, GetPricesResponse>();
    for (const [ticker, data] of tickerData) {
      out.set(ticker, filterSeriesByHorizon(data, horizonDays));
    }
    return out;
  }, [tickerData, horizonIndex]);

  const primaryData = slicedByTicker.get(primaryTicker) ?? null;

  const compareSeries = useMemo(() => {
    if (!isCompareMode) return [];
    return tickers
      .filter((ticker) => slicedByTicker.has(ticker))
      .map((ticker, index) => ({
        ticker,
        color: seriesColor(index),
      }));
  }, [isCompareMode, tickers, slicedByTicker]);

  const compareRows = useMemo(() => {
    if (!isCompareMode || compareSeries.length < 2) return [];
    const inputs = compareSeries.map(({ ticker }) => ({
      ticker,
      series: slicedByTicker.get(ticker)!.series,
    }));
    return alignCompareSeries(inputs, normalization, chartVariant);
  }, [isCompareMode, compareSeries, slicedByTicker, normalization, chartVariant]);

  const hasChartData = isCompareMode
    ? compareSeries.length > 0 && (compareRows.length > 0 || loading)
    : Boolean(primaryData);

  function addTicker(raw: string) {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) {
      setInputTicker("");
      return;
    }
    if (tickers.length >= MAX_COMPARE_TICKERS) return;
    setTickers((prev) => [...prev, t]);
    setInputTicker("");
  }

  function removeTicker(ticker: string) {
    setTickers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((t) => t !== ticker);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    addTicker(inputTicker);
  }

  const lastPriceDisplay = primaryData?.lastPrice ?? tickerData.get(primaryTicker)?.lastPrice ?? null;
  const currencyDisplay = primaryData?.currency ?? tickerData.get(primaryTicker)?.currency ?? null;
  const atCompareCap = tickers.length >= MAX_COMPARE_TICKERS;

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
              placeholder={atCompareCap ? "Max tickers reached" : `e.g. MSFT`}
              maxLength={32}
              disabled={atCompareCap}
            />
            <button
              id={`${formId}-submit`}
              type="submit"
              className="search-btn"
              disabled={loading || atCompareCap || !inputTicker.trim()}
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

        {!loading && globalError && !hasChartData && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {globalError}
          </div>
        )}

        {tickerErrors.size > 0 && (
          <div className="card warning-banner" role="status">
            <strong>Some tickers failed to load:</strong>{" "}
            {[...tickerErrors.entries()].map(([ticker, message]) => `${ticker} (${message})`).join("; ")}
          </div>
        )}

        {hasChartData && (
          <div className="card content-card chart-card--loading-context" aria-busy={loading}>
            <div className="content-toolbar">
              <div className="metrics-block">
                <div className="ticker-chips" role="list" aria-label="Compared tickers">
                  {tickers.map((ticker, index) => (
                    <span
                      key={ticker}
                      className="ticker-chip"
                      role="listitem"
                      style={{ borderColor: isCompareMode ? seriesColor(index) : undefined }}
                    >
                      {isCompareMode && (
                        <span
                          className="ticker-chip__swatch"
                          style={{ background: seriesColor(index) }}
                          aria-hidden
                        />
                      )}
                      <span className="ticker-chip__label">{ticker}</span>
                      {tickers.length > 1 && (
                        <button
                          type="button"
                          className="ticker-chip__remove"
                          onClick={() => removeTicker(ticker)}
                          aria-label={`Remove ${ticker}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {!isCompareMode && primaryData && (
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{primaryTicker}</h2>
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
                        <span className={`metric-badge ${statusClass}`}>
                          {percentChange.text}
                        </span>
                      );
                    })()}
                  </div>
                )}

                {isCompareMode && (
                  <div className="compare-controls">
                    <span className="compare-controls__label">
                      Comparing {compareSeries.length} ticker{compareSeries.length === 1 ? "" : "s"}
                    </span>
                    <div className="normalization-toggle" role="group" aria-label="Chart normalization">
                      <button
                        type="button"
                        className={`horizon-btn ${normalization === "indexed" ? "active" : ""}`}
                        onClick={() => setNormalization("indexed")}
                      >
                        Indexed
                      </button>
                      <button
                        type="button"
                        className={`horizon-btn ${normalization === "absolute" ? "active" : ""}`}
                        onClick={() => setNormalization("absolute")}
                      >
                        Absolute
                      </button>
                    </div>
                    <p className="compare-controls__hint muted">
                      {normalization === "indexed"
                        ? "Each series starts at 100 on the first shared date (relative performance)."
                        : "Raw close prices on a shared time axis."}
                    </p>
                  </div>
                )}

                <div className="horizon-buttons">
                  {HORIZONS.map((h, i) => (
                    <button
                      key={h.label}
                      type="button"
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
              {isCompareMode && compareSeries.length >= 2 ? (
                <PriceChart
                  mode="compare"
                  rows={compareRows}
                  series={compareSeries}
                  normalization={normalization}
                  variant={chartVariant}
                />
              ) : primaryData ? (
                <PriceChart data={primaryData} variant={chartVariant} />
              ) : null}
            </div>
            {loading && (
              <div className="chart-loading-overlay" role="status">
                Loading latest data...
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
