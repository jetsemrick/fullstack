import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, MAX_COMPARE_TICKERS, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import {
  buildSinglePriceRows,
  mergeTimeAlignedIndexedPercent,
  type FetchSeriesResult,
} from "./priceChartData";
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

function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase() || DEFAULT_TICKER;
}

function uniqueTickers(list: string[]): string[] {
  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const ticker of list) {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tickers.push(normalized);
  }
  return tickers;
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
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const [seriesByTicker, setSeriesByTicker] = useState<Map<string, GetPricesResponse>>(new Map());
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    const horizon = HORIZONS[horizonIndex];
    const results = await Promise.all(
      tickers.map(async (requestedTicker): Promise<{ ticker: string; res: Awaited<ReturnType<typeof fetchPrices>> }> => ({
        ticker: requestedTicker,
        res: await fetchPrices({ ticker: requestedTicker, range: horizon.range, interval: horizon.interval }),
      })),
    );

    const nextSeries = new Map<string, GetPricesResponse>();
    const nextErrors = new Map<string, string>();

    for (const { ticker, res } of results) {
      if (!res.ok) {
        nextErrors.set(ticker, res.error.error ?? "Request failed");
        continue;
      }
      if (res.data.series.length === 0) {
        nextErrors.set(ticker, "No data");
        continue;
      }
      nextSeries.set(ticker, res.data);
    }

    setSeriesByTicker(nextSeries);
    setLoadErrors(nextErrors);
    if (nextSeries.size === 0) {
      const firstTicker = tickers[0] ?? DEFAULT_TICKER;
      setFatalError(nextErrors.get(firstTicker) ?? "Could not load data");
    }
    setLoading(false);
  }, [tickers, horizonIndex]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  const slicedDaily = useMemo(() => {
    const next = new Map<string, GetPricesResponse>();
    for (const [ticker, data] of seriesByTicker) {
      next.set(ticker, filterSeriesByHorizon(data, HORIZONS[horizonIndex].days));
    }
    return next;
  }, [seriesByTicker, horizonIndex]);

  const fetchResults = useMemo<FetchSeriesResult[]>(() => {
    return tickers.map((ticker) => {
      const error = loadErrors.get(ticker);
      if (error) return { ok: false, ticker, error };
      const data = slicedDaily.get(ticker);
      if (!data) return { ok: false, ticker, error: "Not loaded" };
      return { ok: true, ticker, series: data.series };
    });
  }, [tickers, slicedDaily, loadErrors]);

  const merged = useMemo(() => mergeTimeAlignedIndexedPercent(fetchResults), [fetchResults]);
  const compareMode = merged.tickersOnChart.length >= 2;
  const primaryTicker = merged.tickersOnChart[0] ?? tickers[0] ?? DEFAULT_TICKER;
  const displayData = slicedDaily.get(primaryTicker) ?? null;
  const chartRows = compareMode ? merged.rows : displayData ? buildSinglePriceRows(displayData) : [];
  const chartTickers = compareMode ? merged.tickersOnChart : displayData ? [displayData.ticker] : [];
  const showChart = !loading && !fatalError && chartTickers.length > 0;

  const lastPriceDisplay = displayData?.lastPrice ?? null;
  const currencyDisplay = displayData?.currency ?? null;
  const mergeFailedMap = new Map(merged.failed.map((failure) => [failure.ticker, failure.error]));
  const partialWarnings = tickers.flatMap((ticker) => {
    const loadError = loadErrors.get(ticker);
    if (loadError) return [{ ticker, message: loadError }];
    const mergeError = mergeFailedMap.get(ticker);
    if (mergeError && !merged.tickersOnChart.includes(ticker)) return [{ ticker, message: mergeError }];
    return [];
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ticker = normalizeTickerInput(inputTicker);
    setTickers((previous) => uniqueTickers([...previous, ticker]).slice(0, MAX_COMPARE_TICKERS));
    setInputTicker(ticker);
  }

  function removeTicker(ticker: string) {
    setTickers((previous) => {
      const next = previous.filter((item) => item !== ticker);
      return next.length > 0 ? next : [DEFAULT_TICKER];
    });
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
              disabled={loading || tickers.length >= MAX_COMPARE_TICKERS}
            >
              Add
            </button>
          </div>
        </form>
      </header>

      <main className="main-content">
        {loading && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
             <div className="skeleton-toolbar" />
             <div className="skeleton-chart" />
          </div>
        )}

        {!loading && fatalError && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {fatalError}
          </div>
        )}

        {showChart && displayData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{compareMode ? "Compare" : displayData.ticker}</h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = compareMode ? null : formatPercentChange(displayData);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                      return (
                        <span className={`metric-badge ${statusClass}`}>
                          {percentChange.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="ticker-chip-row" aria-label="Selected tickers">
                    {tickers.map((ticker) => (
                      <span key={ticker} className="ticker-chip">
                        {ticker}
                        <button
                          type="button"
                          className="ticker-chip-remove"
                          aria-label={`Remove ${ticker}`}
                          onClick={() => removeTicker(ticker)}
                          disabled={loading}
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <span className="muted compare-limit">
                      {tickers.length}/{MAX_COMPARE_TICKERS} symbols
                    </span>
                  </div>
                  <p className="chart-mode-hint muted">
                    {compareMode
                      ? "Compare mode indexes each symbol to 100% at its first valid close in the selected window."
                      : "Add another ticker to compare relative performance on one chart."}
                  </p>
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
              {partialWarnings.length > 0 && (
                <div className="warn-banner" role="status">
                  <strong>Some symbols could not be charted.</strong>
                  <ul>
                    {partialWarnings.map((warning) => (
                      <li key={warning.ticker}>
                        <span className="inline-code">{warning.ticker}</span>: {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  rows={chartRows}
                  tickers={chartTickers}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                  valueMode={compareMode ? "indexedPercent" : "price"}
                />
              </div>
            </div>
            <div className="actions-footer">
              {compareMode && (
                <span className="muted export-hint">
                  Export uses {displayData.ticker}; compare CSV export is a follow-up.
                </span>
              )}
              <button
                type="button"
                className="btn-export"
                onClick={() => downloadPricesCsv(displayData)}
                title="Export CSV"
              >
                Export CSV
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
