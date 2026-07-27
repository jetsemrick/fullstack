import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import {
  alignAndIndexSeries,
  filterSeriesByHorizon,
  MAX_COMPARE_TICKERS_TOTAL,
  normalizeCompareTickers,
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

async function fetchTickerPrices(
  ticker: string,
  fetchRange: string,
  interval: string,
  signal: AbortSignal,
): Promise<GetPricesResponse> {
  const cacheKey = priceCacheKey(ticker, fetchRange, interval);
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetchPrices({ ticker, range: fetchRange, interval, signal });
  if (!res.ok) {
    throw new Error(res.error.error ?? "Request failed");
  }
  priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
  return res.data;
}

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState("");
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [seriesByTicker, setSeriesByTicker] = useState<Record<string, GetPricesResponse>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const allTickers = useMemo(() => [ticker, ...compareTickers], [ticker, compareTickers]);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const horizon = HORIZONS[horizonIndex];
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;

    const results = await Promise.allSettled(
      allTickers.map(async (symbol) => ({
        symbol,
        data: await fetchTickerPrices(symbol, fetchRange, horizon.interval, signal),
      })),
    );

    if (signal.aborted || requestId !== requestIdRef.current) return;

    const nextSeries: Record<string, GetPricesResponse> = {};
    const nextErrors: Record<string, string> = {};

    for (let i = 0; i < results.length; i++) {
      const symbol = allTickers[i]!;
      const result = results[i]!;
      if (result.status === "fulfilled") {
        nextSeries[symbol] = result.value.data;
      } else {
        const message = result.reason instanceof Error ? result.reason.message : "Request failed";
        nextErrors[symbol] = message;
      }
    }

    setLoadErrors(nextErrors);
    setLoading(false);

    setSeriesByTicker((prev) => {
      if (!nextSeries[ticker]) {
        setError(nextErrors[ticker] ?? "Request failed");
        if (Object.keys(prev).length === 0) {
          return {};
        }
        return { ...prev, ...nextSeries };
      }
      setError(null);
      return nextSeries;
    });
  }, [allTickers, horizonIndex, ticker]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const primaryData = seriesByTicker[ticker] ?? null;

  const slicedPrimary = useMemo(() => {
    if (!primaryData) return null;
    return filterSeriesByHorizon(primaryData, HORIZONS[horizonIndex].days);
  }, [primaryData, horizonIndex]);

  const multiSeries = useMemo(() => {
    if (compareTickers.length === 0) return null;
    const inputs = allTickers
      .filter((symbol) => seriesByTicker[symbol])
      .map((symbol) => ({
        ticker: symbol,
        series: filterSeriesByHorizon(seriesByTicker[symbol]!, HORIZONS[horizonIndex].days).series,
      }));
    return alignAndIndexSeries(inputs);
  }, [allTickers, compareTickers.length, seriesByTicker, horizonIndex]);

  const compareLoadErrors = useMemo(
    () => compareTickers.filter((symbol) => loadErrors[symbol]).map((symbol) => ({ symbol, message: loadErrors[symbol]! })),
    [compareTickers, loadErrors],
  );

  const lastPriceDisplay = slicedPrimary?.lastPrice ?? primaryData?.lastPrice ?? null;
  const currencyDisplay = slicedPrimary?.currency ?? primaryData?.currency ?? null;
  const hasChartData = Boolean(primaryData && slicedPrimary);
  const isCompareMode = compareTickers.length > 0 && Boolean(multiSeries && multiSeries.tickers.length >= 2);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
    setCompareTickers((prev) => prev.filter((symbol) => symbol !== t));
  }

  function onAddCompare(e: FormEvent) {
    e.preventDefault();
    addCompareTicker(compareInput);
  }

  function addCompareTicker(raw: string) {
    const next = raw.trim().toUpperCase();
    if (!next) return;
    setCompareTickers((prev) => normalizeCompareTickers(ticker, [...prev, next], MAX_COMPARE_TICKERS_TOTAL));
    setCompareInput("");
  }

  function onCompareKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCompareTicker(compareInput);
    }
  }

  function removeCompareTicker(symbol: string) {
    setCompareTickers((prev) => prev.filter((item) => item !== symbol));
  }

  const atCompareCap = allTickers.length >= MAX_COMPARE_TICKERS_TOTAL;

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

        {!loading && error && !hasChartData && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {error}
          </div>
        )}

        {hasChartData && primaryData && slicedPrimary && (
          <>
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">
                      {isCompareMode ? `${ticker} vs ${compareTickers.join(", ")}` : primaryData.ticker}
                    </h2>
                    {!isCompareMode ? (
                      <>
                        <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                        {(() => {
                          const percentChange = formatPercentChange(slicedPrimary);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                          return (
                            <span className={`metric-badge ${statusClass}`}>
                              {percentChange.text}
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      <span className="metric-badge muted">Indexed to 100 at overlap start</span>
                    )}
                  </div>
                  <form
                    className="compare-form"
                    onSubmit={onAddCompare}
                    aria-labelledby={`${compareFormId}-legend`}
                  >
                    <span id={`${compareFormId}-legend`} className="compare-form__label">Compare</span>
                    <div className="compare-form__row">
                      <input
                        id={`${compareFormId}-input`}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={compareInput}
                        onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                        onKeyDown={onCompareKeyDown}
                        className="compare-form__input"
                        placeholder="Add ticker"
                        maxLength={32}
                        disabled={atCompareCap}
                      />
                      <button
                        type="submit"
                        className="compare-form__add"
                        disabled={atCompareCap || !compareInput.trim()}
                      >
                        Add
                      </button>
                    </div>
                    {compareTickers.length > 0 ? (
                      <div className="compare-chips" role="list" aria-label="Compare tickers">
                        {compareTickers.map((symbol) => (
                          <span key={symbol} className="compare-chip" role="listitem">
                            <span>{symbol}</span>
                            <button
                              type="button"
                              className="compare-chip__remove"
                              aria-label={`Remove ${symbol}`}
                              onClick={() => removeCompareTicker(symbol)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {atCompareCap ? (
                      <p className="compare-form__hint">Maximum {MAX_COMPARE_TICKERS_TOTAL} tickers on chart.</p>
                    ) : null}
                  </form>
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
              {compareLoadErrors.length > 0 ? (
                <div className="compare-errors" role="status">
                  {compareLoadErrors.map(({ symbol, message }) => (
                    <p key={symbol}>
                      Could not load <strong>{symbol}</strong>: {message}
                    </p>
                  ))}
                </div>
              ) : null}
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                {isCompareMode && multiSeries ? (
                  <PriceChart
                    multiSeries={multiSeries}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                ) : (
                  <PriceChart
                    data={slicedPrimary}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                )}
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
