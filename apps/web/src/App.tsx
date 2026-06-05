import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import {
  DEFAULT_TICKER,
  DEFAULT_TICKER_COLORS,
  MAX_COMPARE_TICKERS,
  normalizeTicker,
  type GetPricesResponse,
  type BatchTickerResult,
} from "@stock/shared";
import { fetchPricesBatch } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart, type TickerSeries } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import "./app.css";

interface CompareTicker {
  ticker: string;
  color: string;
  data: GetPricesResponse | null;
  error: string | null;
  loading: boolean;
}

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "---";
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

function getNextColor(usedColors: string[]): string {
  for (const color of DEFAULT_TICKER_COLORS) {
    if (!usedColors.includes(color)) return color;
  }
  return DEFAULT_TICKER_COLORS[0];
}

export default function App() {
  const formId = useId();
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);
  const [compareTickers, setCompareTickers] = useState<CompareTicker[]>([
    { ticker: DEFAULT_TICKER, color: DEFAULT_TICKER_COLORS[0], data: null, error: null, loading: true },
  ]);
  const [activeTicker, setActiveTicker] = useState<string>(DEFAULT_TICKER);

  const loadAllTickers = useCallback(
    async (tickers: string[], horizonIdx: number) => {
      if (tickers.length === 0) return;
      const horizon = HORIZONS[horizonIdx];
      const res = await fetchPricesBatch({ tickers, range: horizon.range, interval: horizon.interval });
      if (!res.ok) {
        setCompareTickers((prev) =>
          prev.map((ct) =>
            tickers.includes(ct.ticker)
              ? { ...ct, loading: false, error: res.error.error ?? "Request failed", data: null }
              : ct
          )
        );
        return;
      }
      const resultMap = new Map<string, BatchTickerResult>();
      for (const r of res.data.results) {
        resultMap.set(r.ticker.toUpperCase(), r);
      }
      setCompareTickers((prev) =>
        prev.map((ct) => {
          const result = resultMap.get(ct.ticker.toUpperCase());
          if (!result) return ct;
          if (result.ok) {
            return { ...ct, loading: false, error: null, data: result.data };
          }
          return { ...ct, loading: false, error: result.error, data: null };
        })
      );
    },
    []
  );

  const tickerListKey = compareTickers.map((ct) => ct.ticker).join(",");

  useEffect(() => {
    const tickers = tickerListKey.split(",").filter(Boolean);
    if (tickers.length === 0) return;
    setCompareTickers((prev) => prev.map((ct) => ({ ...ct, loading: true, data: null, error: null })));
    void loadAllTickers(tickers, horizonIndex);
  }, [tickerListKey, horizonIndex, loadAllTickers]);

  const addTicker = useCallback(
    (ticker: string) => {
      const normalized = normalizeTicker(ticker);
      if (!normalized) return;
      if (compareTickers.some((ct) => ct.ticker === normalized)) {
        setActiveTicker(normalized);
        return;
      }
      if (compareTickers.length >= MAX_COMPARE_TICKERS) {
        return;
      }
      const usedColors = compareTickers.map((ct) => ct.color);
      const newColor = getNextColor(usedColors);
      setCompareTickers((prev) => [
        ...prev,
        { ticker: normalized, color: newColor, data: null, error: null, loading: true },
      ]);
      setActiveTicker(normalized);
    },
    [compareTickers]
  );

  const removeTicker = useCallback(
    (ticker: string) => {
      if (compareTickers.length <= 1) return;
      setCompareTickers((prev) => prev.filter((ct) => ct.ticker !== ticker));
      if (activeTicker === ticker) {
        const remaining = compareTickers.filter((ct) => ct.ticker !== ticker);
        if (remaining.length > 0) {
          setActiveTicker(remaining[0].ticker);
        }
      }
    },
    [compareTickers, activeTicker]
  );

  const changeColor = useCallback((ticker: string, color: string) => {
    setCompareTickers((prev) => prev.map((ct) => (ct.ticker === ticker ? { ...ct, color } : ct)));
  }, []);

  const activeTickerData = useMemo(() => {
    return compareTickers.find((ct) => ct.ticker === activeTicker) ?? compareTickers[0];
  }, [compareTickers, activeTicker]);

  const chartSeries = useMemo<TickerSeries[]>(() => {
    return compareTickers
      .filter((ct) => ct.data && ct.data.series.length > 0)
      .map((ct) => {
        const filtered = filterSeriesByHorizon(ct.data!, HORIZONS[horizonIndex].days);
        return {
          ticker: ct.ticker,
          color: ct.color,
          data: filtered,
        };
      });
  }, [compareTickers, horizonIndex]);

  const isLoading = compareTickers.some((ct) => ct.loading);
  const allErrors = compareTickers.filter((ct) => ct.error && !ct.loading);
  const hasAnyData = chartSeries.length > 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase();
    if (t) {
      addTicker(t);
      setInputTicker("");
    }
  }

  const canAddMore = compareTickers.length < MAX_COMPARE_TICKERS;

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
              placeholder={canAddMore ? "Add ticker..." : "Max tickers reached"}
              maxLength={32}
              disabled={!canAddMore}
            />
            <button
              id={`${formId}-submit`}
              type="submit"
              className="search-btn"
              disabled={isLoading || !canAddMore || !inputTicker.trim()}
            >
              Add
            </button>
          </div>
        </form>
      </header>

      <main className="main-content">
        {isLoading && !hasAnyData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!isLoading && !hasAnyData && allErrors.length > 0 && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {allErrors[0]?.error ?? "Request failed"}
          </div>
        )}

        {hasAnyData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="compare-pills" role="list" aria-label="Compared tickers">
                    {compareTickers.map((ct) => (
                      <div
                        key={ct.ticker}
                        role="listitem"
                        className={`compare-pill ${activeTicker === ct.ticker ? "active" : ""} ${ct.error ? "error" : ""}`}
                        onClick={() => setActiveTicker(ct.ticker)}
                        onKeyDown={(e) => e.key === "Enter" && setActiveTicker(ct.ticker)}
                        tabIndex={0}
                        aria-current={activeTicker === ct.ticker ? "true" : undefined}
                      >
                        <span
                          className="pill-color-swatch"
                          style={{ backgroundColor: ct.color }}
                          aria-hidden="true"
                        />
                        <span className="pill-ticker">{ct.ticker}</span>
                        {ct.loading && <span className="pill-loading" aria-label="Loading">...</span>}
                        {ct.error && <span className="pill-error" aria-label="Error">!</span>}
                        {!ct.error && ct.data && (
                          <span className="pill-price">{formatLast(ct.data.lastPrice, ct.data.currency)}</span>
                        )}
                        {compareTickers.length > 1 && (
                          <button
                            type="button"
                            className="pill-remove"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTicker(ct.ticker);
                            }}
                            aria-label={`Remove ${ct.ticker}`}
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="metrics-inline">
                    {activeTickerData?.data && (
                      <>
                        <h2 className="ticker-display">{activeTickerData.ticker}</h2>
                        <span className="metric-badge">
                          {formatLast(activeTickerData.data.lastPrice, activeTickerData.data.currency)}
                        </span>
                        {(() => {
                          const filtered = filterSeriesByHorizon(
                            activeTickerData.data,
                            HORIZONS[horizonIndex].days
                          );
                          const percentChange = formatPercentChange(filtered);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive
                            ? "positive"
                            : percentChange.isNegative
                              ? "negative"
                              : "muted";
                          return <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>;
                        })()}
                      </>
                    )}
                    {activeTickerData?.error && (
                      <span className="metric-badge negative">{activeTickerData.error}</span>
                    )}
                  </div>
                  <div className="toolbar-row">
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
                    {activeTickerData && (
                      <div className="color-picker-wrapper">
                        <label htmlFor={`${formId}-color`} className="sr-only">
                          Line color for {activeTickerData.ticker}
                        </label>
                        <input
                          id={`${formId}-color`}
                          type="color"
                          value={activeTickerData.color}
                          onChange={(e) => changeColor(activeTickerData.ticker, e.target.value)}
                          className="color-picker"
                          title={`Change line color for ${activeTickerData.ticker}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="chart-container" aria-label="Price chart">
                <PriceChart series={chartSeries} variant={horizonIndex === 0 ? "intraday" : "daily"} />
              </div>
            </div>
            <div className="actions-footer">
              {activeTickerData?.data && (
                <button
                  type="button"
                  className="btn-export"
                  onClick={() => {
                    const filtered = filterSeriesByHorizon(activeTickerData.data!, HORIZONS[horizonIndex].days);
                    downloadPricesCsv(filtered);
                  }}
                  title={`Export ${activeTickerData.ticker} CSV`}
                >
                  Export {activeTickerData.ticker} CSV
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
