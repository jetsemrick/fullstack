import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, MAX_COMPARE_TICKERS, COMPARE_COLORS, type GetPricesResponse, type CompareTickerData } from "@stock/shared";
import { fetchPrices } from "./api";
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
  const first = data.series[0].close;
  const last = data.series[data.series.length - 1].close;
  if (!first) return null;
  const diff = last - first;
  const pct = (diff / first) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    isPositive: pct > 0,
    isNegative: pct < 0
  };
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" }
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

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const [compareTickers, setCompareTickers] = useState<CompareTickerData[]>([]);
  const [compareInput, setCompareInput] = useState<string>("");
  const compareRequestIdRef = useRef(0);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const cacheKey = priceCacheKey(ticker, horizon.range, horizon.interval);
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    let res: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval, signal });
    } catch (e) {
      if (signal.aborted) return;
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setError(e instanceof Error ? e.message : "Request failed");
      return;
    }
    if (signal.aborted || requestId !== requestIdRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setError(res.error.error ?? "Request failed");
      return;
    }
    priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
    setData(res.data);
  }, [ticker, horizonIndex]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const loadCompareTicker = useCallback(async (tickerToLoad: string, signal: AbortSignal) => {
    const requestId = ++compareRequestIdRef.current;
    const horizon = HORIZONS[horizonIndex];
    const cacheKey = priceCacheKey(tickerToLoad, horizon.range, horizon.interval);
    const cached = priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
      if (signal.aborted || requestId !== compareRequestIdRef.current) return;
      setCompareTickers(prev => prev.map(ct => 
        ct.ticker === tickerToLoad ? { ...ct, data: cached.data, loading: false, error: null } : ct
      ));
      return;
    }

    let res: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      res = await fetchPrices({ ticker: tickerToLoad, range: horizon.range, interval: horizon.interval, signal });
    } catch (e) {
      if (signal.aborted) return;
      if (requestId !== compareRequestIdRef.current) return;
      setCompareTickers(prev => prev.map(ct => 
        ct.ticker === tickerToLoad ? { ...ct, loading: false, error: e instanceof Error ? e.message : "Request failed" } : ct
      ));
      return;
    }
    if (signal.aborted || requestId !== compareRequestIdRef.current) return;
    
    if (!res.ok) {
      setCompareTickers(prev => prev.map(ct => 
        ct.ticker === tickerToLoad ? { ...ct, loading: false, error: res.error.error ?? "Request failed" } : ct
      ));
      return;
    }
    
    priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
    setCompareTickers(prev => prev.map(ct => 
      ct.ticker === tickerToLoad ? { ...ct, data: res.data, loading: false, error: null } : ct
    ));
  }, [horizonIndex]);

  const addCompareTicker = useCallback((newTicker: string) => {
    const normalized = newTicker.trim().toUpperCase();
    if (!normalized) return;
    if (normalized === ticker) return;
    if (compareTickers.some(ct => ct.ticker === normalized)) return;
    if (compareTickers.length >= MAX_COMPARE_TICKERS - 1) return;
    
    setCompareTickers(prev => [...prev, { ticker: normalized, data: null, loading: true, error: null }]);
  }, [ticker, compareTickers]);

  const removeCompareTicker = useCallback((tickerToRemove: string) => {
    setCompareTickers(prev => prev.filter(ct => ct.ticker !== tickerToRemove));
  }, []);

  useEffect(() => {
    const loadingTickers = compareTickers.filter(ct => ct.loading);
    if (loadingTickers.length === 0) return;
    
    const controller = new AbortController();
    loadingTickers.forEach(ct => {
      void loadCompareTicker(ct.ticker, controller.signal);
    });
    return () => controller.abort();
  }, [compareTickers, loadCompareTicker]);

  useEffect(() => {
    if (compareTickers.length === 0) return;
    setCompareTickers(prev => prev.map(ct => ({ ...ct, loading: true })));
  }, [horizonIndex]);

  const slicedDaily = useMemo(() => {
    if (!data) return null;
    return filterSeriesByHorizon(data, HORIZONS[horizonIndex].days);
  }, [data, horizonIndex]);

  const displayData = useMemo(() => {
    if (!slicedDaily) return null;
    return slicedDaily;
  }, [slicedDaily]);

  const lastPriceDisplay = displayData?.lastPrice ?? data?.lastPrice ?? null;
  const currencyDisplay = displayData?.currency ?? data?.currency ?? null;
  const hasChartData = Boolean(data && displayData);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
    setCompareTickers([]);
  }

  function onCompareSubmit(e: FormEvent) {
    e.preventDefault();
    addCompareTicker(compareInput);
    setCompareInput("");
  }

  const hasCompareErrors = compareTickers.some(ct => ct.error);
  const successfulCompareTickers = compareTickers.filter(ct => ct.data && !ct.error);
  const isCompareMode = compareTickers.length > 0;

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="search-forms">
          <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
            <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">Ticker</label>
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
                placeholder={`e.g. ${DEFAULT_TICKER}`}
                maxLength={32}
              />
              <button
                id={`${formId}-submit`}
                type="submit"
                className="search-btn"
                disabled={loading}
              >
                Search
              </button>
            </div>
          </form>
          {data && (
            <form className="compare-form" onSubmit={onCompareSubmit} aria-label="Add ticker to compare">
              <div className="search-input-wrapper compare-input-wrapper">
                <input
                  name="compare"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={compareInput}
                  onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                  className="search-input compare-input"
                  placeholder="Compare with..."
                  maxLength={32}
                  disabled={compareTickers.length >= MAX_COMPARE_TICKERS - 1}
                />
                <button
                  type="submit"
                  className="search-btn compare-btn"
                  disabled={compareTickers.length >= MAX_COMPARE_TICKERS - 1 || !compareInput.trim()}
                >
                  +
                </button>
              </div>
            </form>
          )}
        </div>
      </header>

      <main className="main-content">
        {loading && !hasChartData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
             <div className="skeleton-toolbar" />
             <div className="skeleton-chart" />
          </div>
        )}

        {!loading && error && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {error}
          </div>
        )}

        {!error && data && displayData && (
          <>
            {hasCompareErrors && (
              <div className="card error-banner error-banner--partial" role="alert">
                <strong>Some tickers failed to load:</strong>{" "}
                {compareTickers.filter(ct => ct.error).map(ct => `${ct.ticker}: ${ct.error}`).join("; ")}
              </div>
            )}
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
                  {!isCompareMode ? (
                    <div className="metrics-inline">
                      <h2 className="ticker-display">{data.ticker}</h2>
                      <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                      {(() => {
                        const percentChange = formatPercentChange(displayData);
                        if (!percentChange) return null;
                        const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                        return (
                          <span className={`metric-badge ${statusClass}`}>
                            {percentChange.text}
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="compare-chips">
                      <div 
                        className="compare-chip" 
                        style={{ borderColor: COMPARE_COLORS[0] }}
                      >
                        <span 
                          className="compare-chip__color" 
                          style={{ backgroundColor: COMPARE_COLORS[0] }}
                        />
                        <span className="compare-chip__ticker">{data.ticker}</span>
                        <span className="compare-chip__price">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                        {(() => {
                          const percentChange = formatPercentChange(displayData);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "";
                          return (
                            <span className={`compare-chip__pct ${statusClass}`}>
                              {percentChange.text}
                            </span>
                          );
                        })()}
                      </div>
                      {compareTickers.map((ct, idx) => {
                        const colorIndex = idx + 1;
                        const color = COMPARE_COLORS[colorIndex % COMPARE_COLORS.length];
                        const ctSliced = ct.data ? filterSeriesByHorizon(ct.data, HORIZONS[horizonIndex].days) : null;
                        const ctPercentChange = ctSliced ? formatPercentChange(ctSliced) : null;
                        return (
                          <div 
                            key={ct.ticker} 
                            className={`compare-chip ${ct.error ? "compare-chip--error" : ""}`}
                            style={{ borderColor: ct.error ? undefined : color }}
                          >
                            <span 
                              className="compare-chip__color" 
                              style={{ backgroundColor: ct.error ? "var(--fg-muted)" : color }}
                            />
                            <span className="compare-chip__ticker">{ct.ticker}</span>
                            {ct.loading && <span className="compare-chip__status">Loading...</span>}
                            {ct.error && <span className="compare-chip__status compare-chip__status--error">Error</span>}
                            {ct.data && !ct.error && (
                              <>
                                <span className="compare-chip__price">
                                  {formatLast(ct.data.lastPrice, ct.data.currency)}
                                </span>
                                {ctPercentChange && (
                                  <span className={`compare-chip__pct ${ctPercentChange.isPositive ? "positive" : ctPercentChange.isNegative ? "negative" : ""}`}>
                                    {ctPercentChange.text}
                                  </span>
                                )}
                              </>
                            )}
                            <button
                              type="button"
                              className="compare-chip__remove"
                              onClick={() => removeCompareTicker(ct.ticker)}
                              aria-label={`Remove ${ct.ticker}`}
                            >
                              x
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  data={displayData}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                  compareTickers={successfulCompareTickers.map((ct, idx) => ({
                    ...ct,
                    data: ct.data ? filterSeriesByHorizon(ct.data, HORIZONS[horizonIndex].days) : null,
                    color: COMPARE_COLORS[(idx + 1) % COMPARE_COLORS.length],
                  }))}
                  primaryColor={COMPARE_COLORS[0]}
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
    </div>
  );
}
