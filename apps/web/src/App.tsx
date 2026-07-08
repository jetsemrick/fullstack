import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPricesForTickers } from "./api";
import { CompareTickerList } from "./CompareTickerList";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  MAX_COMPARE_TICKERS,
  addTickerToList,
  buildCompareChartRows,
  buildCompareSeries,
  filterSeriesByHorizon,
  normalizeTickerInput,
  removeTickerFromList,
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

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const [selectedTickers, setSelectedTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [searchInput, setSearchInput] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(0);
  const [addError, setAddError] = useState<string | null>(null);

  const [seriesByTicker, setSeriesByTicker] = useState<Record<string, GetPricesResponse>>({});
  const [errorsByTicker, setErrorsByTicker] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const horizon = HORIZONS[horizonIndex]!;
  const isCompareMode = selectedTickers.length > 1;

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    if (selectedTickers.length === 0) {
      setSeriesByTicker({});
      setErrorsByTicker({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const cachedEntries: Record<string, GetPricesResponse> = {};
    const tickersToFetch: string[] = [];
    for (const ticker of selectedTickers) {
      const cacheKey = priceCacheKey(ticker, horizon.range, horizon.interval);
      const cached = priceCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
        cachedEntries[ticker] = cached.data;
      } else {
        tickersToFetch.push(ticker);
      }
    }

    if (Object.keys(cachedEntries).length > 0) {
      if (signal.aborted || requestId !== requestIdRef.current) return;
      setSeriesByTicker((prev) => ({ ...prev, ...cachedEntries }));
    }

    let fetchResults: Awaited<ReturnType<typeof fetchPricesForTickers>> = [];
    if (tickersToFetch.length > 0) {
      try {
        fetchResults = await fetchPricesForTickers(tickersToFetch, {
          range: horizon.range,
          interval: horizon.interval,
          signal,
        });
      } catch (e) {
        if (signal.aborted || requestId !== requestIdRef.current) return;
        setLoading(false);
        setErrorsByTicker((prev) => ({
          ...prev,
          ...Object.fromEntries(
            tickersToFetch.map((t) => [t, e instanceof Error ? e.message : "Request failed"]),
          ),
        }));
        return;
      }
    }

    if (signal.aborted || requestId !== requestIdRef.current) return;

    const nextSeries = { ...cachedEntries };
    const nextErrors: Record<string, string> = {};

    for (const r of fetchResults) {
      if (r.ok) {
        nextSeries[r.ticker] = r.data;
        priceCache.set(priceCacheKey(r.ticker, horizon.range, horizon.interval), {
          data: r.data,
          fetchedAt: Date.now(),
        });
      } else {
        nextErrors[r.ticker] = r.error.error ?? "Request failed";
      }
    }

    setSeriesByTicker((prev) => {
      const merged = { ...prev, ...nextSeries };
      for (const t of Object.keys(nextErrors)) {
        delete merged[t];
      }
      return merged;
    });
    setErrorsByTicker(nextErrors);
    setLoading(false);
  }, [selectedTickers, horizon.range, horizon.interval]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const slicedByTicker = useMemo(() => {
    const out: Record<string, GetPricesResponse> = {};
    for (const [ticker, data] of Object.entries(seriesByTicker)) {
      out[ticker] = filterSeriesByHorizon(data, horizon.days);
    }
    return out;
  }, [seriesByTicker, horizon.days]);

  const successfulTickers = useMemo(
    () => selectedTickers.filter((t) => slicedByTicker[t] != null),
    [selectedTickers, slicedByTicker],
  );

  const compareInputs = useMemo(
    () => successfulTickers.map((ticker) => ({ ticker, data: slicedByTicker[ticker]! })),
    [successfulTickers, slicedByTicker],
  );

  const compareSeries = useMemo(() => buildCompareSeries(compareInputs), [compareInputs]);
  const compareRows = useMemo(() => buildCompareChartRows(compareInputs), [compareInputs]);
  const colorByTicker = useMemo(
    () => Object.fromEntries(compareSeries.map((s) => [s.ticker, s.color])),
    [compareSeries],
  );

  const primaryTicker = selectedTickers[0] ?? DEFAULT_TICKER;
  const primaryData = slicedByTicker[primaryTicker] ?? null;

  const failedTickers = useMemo(
    () => selectedTickers.filter((t) => errorsByTicker[t] != null),
    [selectedTickers, errorsByTicker],
  );

  const hasChartData = isCompareMode ? compareInputs.length > 0 : primaryData != null;
  const allFailed = !loading && selectedTickers.length > 0 && !hasChartData;

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const ticker = normalizeTickerInput(searchInput) || DEFAULT_TICKER;
    setSelectedTickers((prev) => {
      const without = removeTickerFromList(prev, ticker);
      if (without.length === prev.length) {
        return [ticker, ...prev.filter((t) => t !== ticker)].slice(0, MAX_COMPARE_TICKERS);
      }
      return [ticker, ...without].slice(0, MAX_COMPARE_TICKERS);
    });
    setSearchInput(ticker);
  }

  function onCompareSubmit(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const result = addTickerToList(selectedTickers, compareInput);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    setSelectedTickers(result.tickers);
    setCompareInput("");
  }

  function onRemoveTicker(ticker: string) {
    setAddError(null);
    const next = removeTickerFromList(selectedTickers, ticker);
    setSelectedTickers(next.length > 0 ? next : [DEFAULT_TICKER]);
    setSeriesByTicker((prev) => {
      const copy = { ...prev };
      delete copy[ticker];
      return copy;
    });
    setErrorsByTicker((prev) => {
      const copy = { ...prev };
      delete copy[ticker];
      return copy;
    });
  }

  const chartVariant = horizonIndex === 0 ? "intraday" : "daily";

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-compare">
          <form className="search-form" onSubmit={onSearchSubmit} aria-labelledby={`${formId}-legend`}>
            <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
              Primary ticker
            </label>
            <div className="search-input-wrapper">
              <input
                id={`${formId}-ticker`}
                name="ticker"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                className="search-input"
                placeholder={`e.g. ${DEFAULT_TICKER}`}
                maxLength={32}
              />
              <button id={`${formId}-submit`} type="submit" className="search-btn" disabled={loading}>
                Search
              </button>
            </div>
          </form>
          <form
            className="search-form compare-form"
            onSubmit={onCompareSubmit}
            aria-labelledby={`${compareFormId}-legend`}
          >
            <label id={`${compareFormId}-legend`} htmlFor={`${compareFormId}-compare`} className="sr-only">
              Compare with
            </label>
            <div className="search-input-wrapper">
              <input
                id={`${compareFormId}-compare`}
                name="compare"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={compareInput}
                onChange={(e) => {
                  setCompareInput(e.target.value.toUpperCase());
                  if (addError) setAddError(null);
                }}
                className="search-input compare-input"
                placeholder={`Compare with (max ${MAX_COMPARE_TICKERS})`}
                maxLength={32}
                aria-describedby={addError ? `${compareFormId}-add-error` : undefined}
              />
              <button
                id={`${compareFormId}-submit`}
                type="submit"
                className="search-btn compare-btn"
                disabled={loading || selectedTickers.length >= MAX_COMPARE_TICKERS}
              >
                Add
              </button>
            </div>
          </form>
          {addError && (
            <p id={`${compareFormId}-add-error`} className="compare-add-error" role="status">
              {addError}
            </p>
          )}
          <ul className="compare-chips" aria-label="Tickers on chart">
            {selectedTickers.map((t) => (
              <li key={t}>
                <span
                  className="compare-chip"
                  style={
                    isCompareMode && colorByTicker[t]
                      ? { borderLeftColor: colorByTicker[t] }
                      : undefined
                  }
                >
                  <span className="compare-chip__label">{t}</span>
                  {selectedTickers.length > 1 && (
                    <button
                      type="button"
                      className="compare-chip__remove"
                      onClick={() => onRemoveTicker(t)}
                      aria-label={`Remove ${t} from chart`}
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <main className="main-content">
        {loading && !hasChartData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!loading && allFailed && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong>{" "}
            {Object.entries(errorsByTicker)
              .map(([t, msg]) => `${t}: ${msg}`)
              .join(" · ")}
          </div>
        )}

        {!loading && failedTickers.length > 0 && hasChartData && (
          <div className="card compare-warning" role="status">
            <strong>Some tickers could not be loaded:</strong>{" "}
            {failedTickers.map((t) => `${t} (${errorsByTicker[t]})`).join(" · ")}
          </div>
        )}

        {hasChartData && (
          <div className="card content-card chart-card--loading-context" aria-busy={loading}>
            <div className="content-toolbar">
              <div className="metrics-block">
                {isCompareMode ? (
                  <CompareTickerList series={compareSeries} dataByTicker={slicedByTicker} />
                ) : (
                  primaryData && (
                    <div className="metrics-inline">
                      <h2 className="ticker-display">{primaryData.ticker}</h2>
                      <span className="metric-badge">{formatLast(primaryData.lastPrice, primaryData.currency)}</span>
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
                    </div>
                  )
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
              {isCompareMode ? (
                <PriceChart compare rows={compareRows} series={compareSeries} variant={chartVariant} />
              ) : (
                primaryData && <PriceChart data={primaryData} variant={chartVariant} />
              )}
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
