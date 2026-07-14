import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import { calculateBacktest, parseTradeDate, type BacktestResult } from "./backtest";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatMoney(value: number, currency: string | null) {
  if (currency) {
    try {
      return value.toLocaleString(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      // Fall through when an upstream currency code is not supported.
    }
  }
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${currency ? ` ${currency}` : ""}`;
}

function formatSessionDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export default function App() {
  const formId = useId();
  const backtestFormId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [backtestTicker, setBacktestTicker] = useState(DEFAULT_TICKER);
  const [backtestVolume, setBacktestVolume] = useState("10");
  const [backtestDate, setBacktestDate] = useState("");
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<{
    ticker: string;
    currency: string | null;
    values: BacktestResult;
  } | null>(null);
  const backtestRequestIdRef = useRef(0);

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
    setTicker(t);
  }

  async function onBacktestSubmit(e: FormEvent) {
    e.preventDefault();
    const requestedTicker = backtestTicker.trim().toUpperCase();
    const volume = Number(backtestVolume);
    const tradeDateMs = parseTradeDate(backtestDate);

    setBacktestResult(null);
    if (!requestedTicker) {
      setBacktestError("Enter a ticker symbol.");
      return;
    }
    if (!Number.isFinite(volume) || volume <= 0) {
      setBacktestError("Share volume must be greater than zero.");
      return;
    }
    if (tradeDateMs == null) {
      setBacktestError("Enter a valid trade date.");
      return;
    }
    if (backtestDate > getLocalDateString()) {
      setBacktestError("Trade date cannot be in the future.");
      return;
    }

    const requestId = ++backtestRequestIdRef.current;
    setBacktestError(null);
    setBacktestLoading(true);

    try {
      const response = await fetchPrices({
        ticker: requestedTicker,
        range: "max",
        interval: "1d",
      });
      if (requestId !== backtestRequestIdRef.current) return;
      if (!response.ok) {
        setBacktestError(response.error.error || "Could not load price history.");
        return;
      }

      const calculation = calculateBacktest(response.data.series, volume, backtestDate);
      if (!calculation.ok) {
        setBacktestError(calculation.error);
        return;
      }
      setBacktestResult({
        ticker: response.data.ticker,
        currency: response.data.currency,
        values: calculation.result,
      });
    } catch (backtestRequestError) {
      if (requestId !== backtestRequestIdRef.current) return;
      setBacktestError(
        backtestRequestError instanceof Error ? backtestRequestError.message : "Could not load price history.",
      );
    } finally {
      if (requestId === backtestRequestIdRef.current) setBacktestLoading(false);
    }
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
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  data={displayData}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
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

        <section className="card backtest-card" aria-labelledby={`${backtestFormId}-title`}>
          <div className="backtest-heading">
            <div>
              <p className="backtest-eyebrow">Hypothetical trade</p>
              <h2 id={`${backtestFormId}-title`} className="backtest-title">Buy-at-date backtest</h2>
            </div>
            <p className="backtest-description">
              Calculate unrealized profit or loss from the first market close on or after your trade date.
            </p>
          </div>

          <form className="backtest-form" onSubmit={onBacktestSubmit}>
            <label className="backtest-field" htmlFor={`${backtestFormId}-ticker`}>
              <span>Ticker</span>
              <input
                id={`${backtestFormId}-ticker`}
                name="backtestTicker"
                value={backtestTicker}
                onChange={(event) => setBacktestTicker(event.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                placeholder="AAPL"
              />
            </label>
            <label className="backtest-field" htmlFor={`${backtestFormId}-volume`}>
              <span>Shares</span>
              <input
                id={`${backtestFormId}-volume`}
                name="volume"
                type="number"
                min="0"
                step="any"
                value={backtestVolume}
                onChange={(event) => setBacktestVolume(event.target.value)}
                placeholder="10"
              />
            </label>
            <label className="backtest-field" htmlFor={`${backtestFormId}-date`}>
              <span>Trade date</span>
              <input
                id={`${backtestFormId}-date`}
                name="tradeDate"
                type="date"
                max={getLocalDateString()}
                value={backtestDate}
                onChange={(event) => setBacktestDate(event.target.value)}
              />
            </label>
            <button className="backtest-submit" type="submit" disabled={backtestLoading}>
              {backtestLoading ? "Calculating..." : "Run backtest"}
            </button>
          </form>

          {backtestError && (
            <p className="backtest-error" role="alert">{backtestError}</p>
          )}

          {backtestResult && (
            <div className="backtest-results" aria-live="polite">
              <div className="backtest-summary">
                <div>
                  <span className="backtest-result-label">Entry used</span>
                  <strong>{formatSessionDate(backtestResult.values.entryTimestamp)}</strong>
                </div>
                <div>
                  <span className="backtest-result-label">Entry close</span>
                  <strong>{formatMoney(backtestResult.values.entryClose, backtestResult.currency)}</strong>
                </div>
                <div>
                  <span className="backtest-result-label">Latest close</span>
                  <strong>{formatMoney(backtestResult.values.latestClose, backtestResult.currency)}</strong>
                  <small>{formatSessionDate(backtestResult.values.latestTimestamp)}</small>
                </div>
              </div>
              <div className="backtest-metrics">
                <div className="backtest-metric">
                  <span>Cost basis</span>
                  <strong>{formatMoney(backtestResult.values.costBasis, backtestResult.currency)}</strong>
                </div>
                <div className="backtest-metric">
                  <span>Market value</span>
                  <strong>{formatMoney(backtestResult.values.marketValue, backtestResult.currency)}</strong>
                </div>
                <div className={`backtest-metric ${backtestResult.values.profitLoss > 0 ? "positive" : backtestResult.values.profitLoss < 0 ? "negative" : ""}`}>
                  <span>Unrealized P&amp;L</span>
                  <strong>
                    {formatMoney(backtestResult.values.profitLoss, backtestResult.currency)}
                    {" "}
                    ({backtestResult.values.profitLossPercent > 0 ? "+" : ""}
                    {backtestResult.values.profitLossPercent.toFixed(2)}%)
                  </strong>
                </div>
              </div>
              <p className="backtest-footnote">
                {backtestResult.values.volume.toLocaleString()} {backtestResult.ticker} shares using unadjusted daily closes.
              </p>
            </div>
          )}
        </section>
      </main>
      <ReportBug />
    </div>
  );
}
