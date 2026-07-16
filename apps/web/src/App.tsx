import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import {
  MAX_COMPARE_TICKERS,
  buildCompareRows,
  buildCompareSeriesMeta,
  downsampleCompareRows,
} from "./compareChartData";
import { PriceChart } from "./PriceChart";
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
    isNegative: pct < 0,
  };
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" },
];

const MAX_DAILY_RENDER_POINTS = 1_200;
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

type FailedTicker = { ticker: string; message: string };

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState("");
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [seriesData, setSeriesData] = useState<GetPricesResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedTickers, setFailedTickers] = useState<FailedTicker[]>([]);
  const requestIdRef = useRef(0);

  const primaryTicker = tickers[0] ?? DEFAULT_TICKER;
  const isCompareMode = tickers.length >= 2;

  const load = useCallback(
    async (signal: AbortSignal) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setFailedTickers([]);

      const horizon = HORIZONS[horizonIndex];
      const fetchRange = horizon.days > 1 ? "max" : horizon.range;

      const results = await Promise.allSettled(
        tickers.map(async (t) => {
          const cacheKey = priceCacheKey(t, fetchRange, horizon.interval);
          const cached = priceCache.get(cacheKey);
          if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
            return { ticker: t, data: cached.data };
          }
          const res = await fetchPrices({
            ticker: t,
            range: fetchRange,
            interval: horizon.interval,
            signal,
          });
          if (!res.ok) {
            throw new Error(res.error.error ?? "Request failed");
          }
          priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
          return { ticker: t, data: res.data };
        }),
      );

      if (signal.aborted || requestId !== requestIdRef.current) return;

      const successes: GetPricesResponse[] = [];
      const failures: FailedTicker[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const ticker = tickers[i]!;
        if (result.status === "fulfilled") {
          successes.push(result.value.data);
        } else {
          const message =
            result.reason instanceof Error ? result.reason.message : "Request failed";
          failures.push({ ticker, message });
        }
      }

      setLoading(false);
      setFailedTickers(failures);

      if (successes.length === 0) {
        setSeriesData([]);
        setError(failures.map((f) => `${f.ticker}: ${f.message}`).join("; ") || "Request failed");
        return;
      }

      setError(null);
      setSeriesData(successes);
    },
    [tickers, horizonIndex],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const slicedSeries = useMemo(() => {
    const horizonDays = HORIZONS[horizonIndex].days;
    return seriesData
      .filter((d) => tickers.includes(d.ticker))
      .map((d) => filterSeriesByHorizon(d, horizonDays));
  }, [seriesData, horizonIndex, tickers]);

  const primaryData = useMemo(() => {
    return slicedSeries.find((d) => d.ticker === primaryTicker) ?? slicedSeries[0] ?? null;
  }, [slicedSeries, primaryTicker]);

  const compareRows = useMemo(() => {
    if (!isCompareMode || slicedSeries.length < 2) return null;
    const rows = buildCompareRows(slicedSeries, { mode: "indexed" });
    if (horizonIndex === 0) return rows;
    const tickerKeys = slicedSeries.map((d) => d.ticker);
    return downsampleCompareRows(rows, tickerKeys, MAX_DAILY_RENDER_POINTS);
  }, [slicedSeries, isCompareMode, horizonIndex]);

  const compareSeriesMeta = useMemo(() => {
    if (!isCompareMode) return [];
    return buildCompareSeriesMeta(slicedSeries.map((d) => d.ticker));
  }, [slicedSeries, isCompareMode]);

  const tickerColors = useMemo(() => buildCompareSeriesMeta(tickers), [tickers]);

  const effectiveCompareMode =
    isCompareMode && slicedSeries.length >= 2 && compareRows !== null && compareRows.length > 0;

  const lastPriceDisplay = primaryData?.lastPrice ?? null;
  const currencyDisplay = primaryData?.currency ?? null;
  const hasChartData = Boolean(primaryData);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTickers((prev) => {
      const rest = prev.slice(1).filter((sym) => sym !== t);
      return [t, ...rest];
    });
    setInputTicker(t);
  }

  function onAddCompare(e: FormEvent) {
    e.preventDefault();
    const t = compareInput.trim().toUpperCase();
    if (!t) return;
    if (tickers.includes(t)) {
      setCompareInput("");
      return;
    }
    if (tickers.length >= MAX_COMPARE_TICKERS) return;
    setTickers((prev) => [...prev, t]);
    setCompareInput("");
  }

  function removeTicker(ticker: string) {
    setTickers((prev) => {
      const next = prev.filter((t) => t !== ticker);
      return next.length > 0 ? next : [DEFAULT_TICKER];
    });
    if (ticker === inputTicker) {
      setInputTicker(tickers.find((t) => t !== ticker) ?? DEFAULT_TICKER);
    }
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-controls">
          <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
            <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
              Ticker
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

          <div className="compare-section">
            {tickers.length === 1 && (
              <p className="compare-hint">Add another symbol to compare (up to {MAX_COMPARE_TICKERS}).</p>
            )}
            <div className="compare-chips" role="list" aria-label="Compared tickers">
              {tickers.map((t, i) => (
                <span key={t} className="compare-chip" role="listitem">
                  <span
                    className="compare-chip__dot"
                    style={{ background: tickerColors[i]?.color }}
                    aria-hidden
                  />
                  <span className="compare-chip__label">
                    {t}
                    {i === 0 ? " (primary)" : ""}
                  </span>
                  {tickers.length > 1 ? (
                    <button
                      type="button"
                      className="compare-chip__remove"
                      onClick={() => removeTicker(t)}
                      aria-label={`Remove ${t}`}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            {tickers.length < MAX_COMPARE_TICKERS ? (
              <form className="compare-add-form" onSubmit={onAddCompare}>
                <label htmlFor={`${compareFormId}-compare`} className="sr-only">
                  Add ticker to compare
                </label>
                <input
                  id={`${compareFormId}-compare`}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={compareInput}
                  onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                  className="compare-add-input"
                  placeholder="Add ticker"
                  maxLength={32}
                />
                <button type="submit" className="compare-add-btn" disabled={loading || !compareInput.trim()}>
                  Add
                </button>
              </form>
            ) : null}
          </div>
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

        {failedTickers.length > 0 && seriesData.length > 0 && (
          <div className="card partial-error-banner" role="status">
            <strong>Some symbols failed to load:</strong>{" "}
            {failedTickers.map((f) => `${f.ticker} (${f.message})`).join("; ")}
          </div>
        )}

        {!error && primaryData && hasChartData && (
          <div className="card content-card chart-card--loading-context" aria-busy={loading}>
            <div className="content-toolbar">
              <div className="metrics-block">
                <div className="metrics-inline">
                  <h2 className="ticker-display">{primaryData.ticker}</h2>
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
                </div>
                <div className="horizon-row">
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
                  {effectiveCompareMode ? (
                    <span className="compare-indexed-label">Indexed to 100 at period start</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="chart-container" aria-label="Price chart">
              {effectiveCompareMode && compareRows && compareSeriesMeta.length >= 2 ? (
                <PriceChart
                  mode="compare"
                  rows={compareRows}
                  series={compareSeriesMeta}
                  indexed
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              ) : (
                <PriceChart
                  mode="single"
                  data={primaryData}
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
        )}

        {!error && !loading && primaryData && isCompareMode && slicedSeries.length >= 2 && compareRows?.length === 0 && (
          <div className="card error-banner" role="alert">
            <strong>Not enough overlapping dates</strong> for the selected symbols on this horizon.
          </div>
        )}
      </main>
      <ReportBug />
    </div>
  );
}
