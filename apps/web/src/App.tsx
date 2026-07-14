import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, MAX_COMPARE_TICKERS, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import {
  buildComparisonRows,
  hasMixedCurrencies,
  type ComparisonSeriesInput,
} from "./priceChartData";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatPercentChange(data: GetPricesResponse) {
  if (!data.series || data.series.length < 2) return null;
  const first = data.series[0]!.close;
  const last = data.series[data.series.length - 1]!.close;
  if (!first) return null;
  const pct = ((last - first) / first) * 100;
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

type TickerLoadStatus = "loading" | "success" | "error";

type TickerEntry = {
  status: TickerLoadStatus;
  data: GetPricesResponse | null;
  error: string | null;
};

function priceCacheKey(ticker: string, range: string, interval: string): string {
  return `${ticker}:${range}:${interval}`;
}

function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
  const filteredSeries = data.series.filter((point) => point.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

function emptyTickerEntry(status: TickerLoadStatus = "loading"): TickerEntry {
  return { status, data: null, error: null };
}

export default function App() {
  const formId = useId();
  const [activeTickers, setActiveTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState("");
  const [horizonIndex, setHorizonIndex] = useState(0);
  const [tickerState, setTickerState] = useState<Record<string, TickerEntry>>(() => ({
    [DEFAULT_TICKER]: emptyTickerEntry("loading"),
  }));
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    const horizon = HORIZONS[horizonIndex]!;
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;

    setTickerState((prev) => {
      const next = { ...prev };
      for (const ticker of activeTickers) {
        const existing = next[ticker];
        next[ticker] = {
          status: "loading",
          data: existing?.data ?? null,
          error: null,
        };
      }
      return next;
    });

    const results = await Promise.all(
      activeTickers.map(async (ticker) => {
        const cacheKey = priceCacheKey(ticker, fetchRange, horizon.interval);
        const cached = priceCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
          return { ticker, ok: true as const, data: cached.data };
        }

        try {
          const res = await fetchPrices({
            ticker,
            range: fetchRange,
            interval: horizon.interval,
            signal,
          });
          if (!res.ok) {
            return { ticker, ok: false as const, error: res.error.error ?? "Request failed" };
          }
          priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
          return { ticker, ok: true as const, data: res.data };
        } catch (error) {
          if (signal.aborted) return { ticker, ok: false as const, aborted: true as const };
          return {
            ticker,
            ok: false as const,
            error: error instanceof Error ? error.message : "Request failed",
          };
        }
      }),
    );

    if (signal.aborted || requestId !== requestIdRef.current) return;

    setTickerState((prev) => {
      const next = { ...prev };
      for (const result of results) {
        if ("aborted" in result && result.aborted) continue;
        const existing = next[result.ticker];
        if (result.ok) {
          next[result.ticker] = { status: "success", data: result.data, error: null };
        } else {
          next[result.ticker] = {
            status: "error",
            data: existing?.data ?? null,
            error: result.error,
          };
        }
      }
      return next;
    });
  }, [activeTickers, horizonIndex]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const horizonDays = HORIZONS[horizonIndex]!.days;
  const successfulSeries = useMemo(() => {
    return activeTickers
      .map((ticker) => tickerState[ticker])
      .filter((entry): entry is TickerEntry & { data: GetPricesResponse } =>
        entry?.data != null && (entry.status === "success" || entry.status === "loading"),
      )
      .map((entry) => filterSeriesByHorizon(entry.data, horizonDays));
  }, [activeTickers, tickerState, horizonDays]);

  const comparisonInputs = useMemo((): ComparisonSeriesInput[] => {
    return successfulSeries.map((data) => ({
      ticker: data.ticker,
      currency: data.currency,
      series: data.series,
    }));
  }, [successfulSeries]);

  const comparison = useMemo(() => buildComparisonRows(comparisonInputs), [comparisonInputs]);
  const mixedCurrencies = useMemo(() => hasMixedCurrencies(comparison.meta), [comparison.meta]);
  const tickerColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of comparison.meta) {
      map.set(m.ticker, m.colorIndex);
    }
    return map;
  }, [comparison.meta]);

  const anyLoading = activeTickers.some((ticker) => tickerState[ticker]?.status === "loading");
  const hasChartData = comparison.rows.length > 0 && comparison.meta.length >= 1;
  const allFailed = activeTickers.length > 0 && successfulSeries.length === 0 && !anyLoading;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = inputTicker.trim().toUpperCase();
    if (!normalized) {
      setFormMessage("Enter a ticker symbol.");
      return;
    }
    if (activeTickers.includes(normalized)) {
      setFormMessage(`${normalized} is already on the chart.`);
      return;
    }
    if (activeTickers.length >= MAX_COMPARE_TICKERS) {
      setFormMessage(`You can compare up to ${MAX_COMPARE_TICKERS} tickers. Remove one to add another.`);
      return;
    }
    setFormMessage(null);
    setActiveTickers((prev) => [...prev, normalized]);
    setTickerState((prev) => ({
      ...prev,
      [normalized]: emptyTickerEntry("loading"),
    }));
    setInputTicker("");
  }

  function removeTicker(ticker: string) {
    if (activeTickers.length <= 1) return;
    setActiveTickers((prev) => prev.filter((entry) => entry !== ticker));
    setTickerState((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    setFormMessage(null);
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
              placeholder={`Add ticker (max ${MAX_COMPARE_TICKERS})`}
              maxLength={32}
            />
            <button id={`${formId}-submit`} type="submit" className="search-btn">
              Add
            </button>
          </div>
        </form>
      </header>

      {formMessage ? (
        <p className="form-message" role="status">
          {formMessage}
        </p>
      ) : null}

      <main className="main-content">
        {anyLoading && !hasChartData ? (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        ) : null}

        {allFailed ? (
          <div className="card error-banner" role="alert">
            <strong>Could not load chart data.</strong> Check the ticker symbols below and try again.
          </div>
        ) : null}

        {hasChartData || activeTickers.length > 0 ? (
          <div className="card content-card chart-card--loading-context" aria-busy={anyLoading}>
            <div className="content-toolbar">
              <div className="metrics-block">
                <div className="ticker-chips" role="list" aria-label="Compared tickers">
                  {activeTickers.map((ticker) => {
                    const entry = tickerState[ticker] ?? emptyTickerEntry();
                    const data = entry.data;
                    const percentChange = data ? formatPercentChange(filterSeriesByHorizon(data, horizonDays)) : null;
                    const statusClass =
                      entry.status === "loading"
                        ? "ticker-chip--loading"
                        : entry.status === "error"
                          ? "ticker-chip--error"
                          : "ticker-chip--success";

                    const colorIdx = tickerColorIndex.get(ticker);

                    return (
                      <div key={ticker} className={`ticker-chip ${statusClass}`} role="listitem">
                        {colorIdx != null ? (
                          <span
                            className="ticker-chip__swatch"
                            style={{ background: `var(--series-${(colorIdx % 5) + 1})` }}
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="ticker-chip__body">
                          <span className="ticker-chip__symbol">{ticker}</span>
                          {entry.status === "loading" ? (
                            <span className="ticker-chip__meta">Loading…</span>
                          ) : entry.status === "error" ? (
                            <span className="ticker-chip__meta ticker-chip__meta--error" role="alert">
                              {entry.error ?? "Failed to load"}
                            </span>
                          ) : data ? (
                            <span className="ticker-chip__meta">
                              {formatLast(data.lastPrice, data.currency)}
                              {percentChange ? (
                                <span
                                  className={`ticker-chip__change ${
                                    percentChange.isPositive
                                      ? "positive"
                                      : percentChange.isNegative
                                        ? "negative"
                                        : "muted"
                                  }`}
                                >
                                  {percentChange.text}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="ticker-chip__remove"
                          onClick={() => removeTicker(ticker)}
                          disabled={activeTickers.length <= 1}
                          aria-label={`Remove ${ticker} from chart`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
                {mixedCurrencies ? (
                  <p className="currency-warning" role="status">
                    Compared tickers use different currencies. Values are absolute prices with no conversion.
                  </p>
                ) : null}
                <div className="horizon-buttons">
                  {HORIZONS.map((horizon, index) => (
                    <button
                      key={horizon.label}
                      className={`horizon-btn ${index === horizonIndex ? "active" : ""}`}
                      onClick={() => setHorizonIndex(index)}
                    >
                      {horizon.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {hasChartData ? (
              <div className="chart-container" aria-label="Price comparison chart">
                <PriceChart
                  series={comparison.meta}
                  rows={comparison.rows}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            ) : (
              <div className="chart-container chart-container--empty">
                <p className="muted">Waiting for ticker data…</p>
              </div>
            )}
            {anyLoading ? (
              <div className="chart-loading-overlay" role="status">
                Loading latest data...
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
      <ReportBug />
    </div>
  );
}
