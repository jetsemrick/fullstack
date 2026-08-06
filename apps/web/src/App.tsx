import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import type { PriceRangeSelection } from "./priceChartData";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
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

function formatRangeChange(selection: PriceRangeSelection, currency: string | null) {
  const sign = selection.change > 0 ? "+" : "";
  const currencySuffix = currency ? ` ${currency}` : "";
  const change = `${sign}${selection.change.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${currencySuffix}`;
  const percent = `${sign}${selection.percentChange.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
  return {
    text: `${change} (${percent})`,
    statusClass: selection.change > 0 ? "positive" : selection.change < 0 ? "negative" : "muted",
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
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
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
  const [selectedRange, setSelectedRange] = useState<PriceRangeSelection | null>(null);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;
    const cacheKey = priceCacheKey(ticker, fetchRange, horizon.interval);
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    let res: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      res = await fetchPrices({ ticker, range: fetchRange, interval: horizon.interval, signal });
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
    setSelectedRange(null);
    setTicker(t);
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
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
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
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
                    {selectedRange ? (() => {
                      const rangeChange = formatRangeChange(selectedRange, currencyDisplay);
                      return (
                        <span className={`metric-badge range-change ${rangeChange.statusClass}`} aria-live="polite">
                          <span className="range-change__label">Selected range</span>
                          {rangeChange.text}
                        </span>
                      );
                    })() : null}
                  </div>
                  <div className="horizon-buttons">
                    {HORIZONS.map((h, i) => (
                      <button
                        key={h.label}
                        className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                        onClick={() => {
                          setSelectedRange(null);
                          setHorizonIndex(i);
                        }}
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
                  key={`${ticker}:${horizonIndex}`}
                  data={displayData}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                  onSelectionChange={setSelectedRange}
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
