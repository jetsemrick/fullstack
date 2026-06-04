import { useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { ComparePriceChart } from "./ComparePriceChart";
import { CompareTickerBar } from "./CompareTickerBar";
import { buildCompareChartRows, MAX_COMPARE_TICKERS, type NormalizeMode } from "./compareChartData";
import { downloadPricesCsv } from "./exportCsv";
import { HORIZONS } from "./filterSeriesByHorizon";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { useComparePrices } from "./useComparePrices";
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

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareTickers, setCompareTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [normalizeMode, setNormalizeMode] = useState<NormalizeMode>("indexed");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const compareEnabled = horizonIndex !== 0;
  const horizon = HORIZONS[horizonIndex]!;
  const fetchTickers = compareEnabled ? compareTickers : [ticker];

  const { loaded, errors, loading } = useComparePrices(fetchTickers, horizon, true);

  const primarySymbol = compareEnabled ? (compareTickers[0] ?? ticker) : ticker;

  const primaryData = useMemo(() => {
    return loaded.find((d) => d.ticker === primarySymbol) ?? loaded[0] ?? null;
  }, [loaded, primarySymbol]);

  const displayData = primaryData;

  const compareChart = useMemo(() => {
    if (!compareEnabled || loaded.length < 2) return null;
    return buildCompareChartRows(loaded, normalizeMode);
  }, [compareEnabled, loaded, normalizeMode]);

  const showCompareChart = compareChart !== null && compareChart.rows.length > 0;
  const allFailed = !loading && loaded.length === 0 && fetchTickers.length > 0;
  const globalError =
    allFailed && errors.length > 0
      ? errors.map((e) => `${e.ticker}: ${e.message}`).join("; ")
      : null;

  const lastPriceDisplay = displayData?.lastPrice ?? null;
  const currencyDisplay = displayData?.currency ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
    setCompareTickers((prev) => {
      if (!compareEnabled || prev.length === 0) return [t];
      return [t, ...prev.slice(1)];
    });
  }

  function handleAddCompare(symbol: string) {
    setCompareTickers((prev) => {
      if (prev.includes(symbol)) return prev;
      if (prev.length >= MAX_COMPARE_TICKERS) return prev;
      return [...prev, symbol];
    });
  }

  function handleRemoveCompare(symbol: string) {
    setCompareTickers((prev) => {
      const next = prev.filter((t) => t !== symbol);
      if (next.length === 0) return [ticker];
      return next;
    });
  }

  const showContent = !loading || loaded.length > 0;
  const showSkeleton = loading && loaded.length === 0;

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
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
            <button id={`${formId}-submit`} type="submit" className="search-btn" disabled={loading && loaded.length === 0}>
              Search
            </button>
          </div>
        </form>
      </header>

      <main className="main-content">
        {showSkeleton && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!showSkeleton && globalError && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {globalError}
          </div>
        )}

        {showContent && !globalError && displayData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{displayData.ticker}</h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(displayData);
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
                    {compareEnabled && compareTickers.length >= 2 && (
                      <span className="metric-badge muted">
                        Comparing {compareTickers.length} symbols
                      </span>
                    )}
                  </div>
                  <CompareTickerBar
                    tickers={compareTickers}
                    normalizeMode={normalizeMode}
                    compareEnabled={compareEnabled}
                    errors={errors}
                    onAdd={handleAddCompare}
                    onRemove={handleRemoveCompare}
                    onNormalizeModeChange={setNormalizeMode}
                  />
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
              <div className="chart-container" aria-label="Price chart">
                {showCompareChart && compareChart ? (
                  <ComparePriceChart
                    rows={compareChart.rows}
                    tickers={compareChart.tickers}
                    normalizeMode={normalizeMode}
                  />
                ) : (
                  <PriceChart
                    data={displayData}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                )}
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => downloadPricesCsv(displayData)}
                title="Export CSV"
                disabled={compareEnabled && compareTickers.length > 1}
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
