import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import {
  COMPARISON_TICKER_LIMIT,
  buildComparisonChartRows,
  buildComparisonSeriesMeta,
  capUniqueTickers,
  filterSeriesByHorizon,
  normalizeCompareTickerInput,
  type ComparisonValueMode,
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
    isNegative: pct < 0,
  };
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" },
];

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);
  const [valueMode, setValueMode] = useState<ComparisonValueMode>("percent");

  const [loadedByTicker, setLoadedByTicker] = useState<Map<string, GetPricesResponse>>(new Map());
  const [failedByTicker, setFailedByTicker] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const horizon = HORIZONS[horizonIndex]!;

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    const loaded = new Map<string, GetPricesResponse>();
    const failed = new Map<string, string>();

    await Promise.all(
      tickers.map(async (sym) => {
        const res = await fetchPrices({
          ticker: sym,
          range: horizon.range,
          interval: horizon.interval,
        });
        if (!res.ok) {
          failed.set(sym, res.error.error ?? "Request failed");
          return;
        }
        loaded.set(sym, filterSeriesByHorizon(res.data, horizon.days));
      }),
    );

    if (loaded.size === 0) {
      const firstMsg = [...failed.values()][0] ?? "Request failed";
      setFatalError(firstMsg);
      setLoadedByTicker(new Map());
      setFailedByTicker(failed);
    } else {
      setFatalError(null);
      setLoadedByTicker(loaded);
      setFailedByTicker(failed);
    }
    setLoading(false);
  }, [tickers, horizon.range, horizon.interval, horizon.days]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadedOrdered = useMemo(
    () => tickers.filter((t) => loadedByTicker.has(t)),
    [tickers, loadedByTicker],
  );

  const primaryTicker = loadedOrdered[0] ?? null;
  const primaryData = primaryTicker ? loadedByTicker.get(primaryTicker) ?? null : null;

  const lastPriceDisplay = primaryData?.lastPrice ?? null;
  const currencyDisplay = primaryData?.currency ?? null;

  const comparisonRows = useMemo(
    () => buildComparisonChartRows(loadedOrdered, loadedByTicker, valueMode),
    [loadedOrdered, loadedByTicker, valueMode],
  );
  const comparisonMeta = useMemo(() => buildComparisonSeriesMeta(loadedOrdered), [loadedOrdered]);

  const partialFailures = failedByTicker.size > 0 && loadedByTicker.size > 0;

  function addTickerSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = normalizeCompareTickerInput(inputTicker);
    const nextTicker = trimmed || normalizeCompareTickerInput(DEFAULT_TICKER);
    const capped = capUniqueTickers([...tickers, nextTicker]);
    if (capped.length === tickers.length) {
      return;
    }
    setTickers(capped);
    setInputTicker("");
  }

  function removeTicker(sym: string) {
    if (tickers.length <= 1) return;
    setTickers((prev) => prev.filter((x) => x !== sym));
  }

  const showChartArea = !loading && !fatalError && loadedByTicker.size > 0 && comparisonRows.length > 0;

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <form className="search-form" onSubmit={addTickerSubmit} aria-labelledby={`${formId}-legend`}>
          <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
            Add ticker
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
              placeholder={`Add symbol (max ${COMPARISON_TICKER_LIMIT})`}
              maxLength={32}
            />
            <button
              id={`${formId}-submit`}
              type="submit"
              className="search-btn"
              disabled={loading || tickers.length >= COMPARISON_TICKER_LIMIT}
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

        {!loading && partialFailures && loadedByTicker.size > 0 && (
          <div className="card warning-banner" role="status">
            <strong>Partial load.</strong>{" "}
            {[...failedByTicker.entries()].map(([sym, msg]) => `${sym}: ${msg}`).join("; ")}
          </div>
        )}

        {showChartArea && primaryData != null && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">
                      {primaryTicker}
                      {loadedOrdered.length > 1 ? (
                        <span className="ticker-display__note">(+{loadedOrdered.length - 1} compared)</span>
                      ) : null}
                    </h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(primaryData);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                      return (
                        <span className={`metric-badge ${statusClass}`}>
                          {percentChange.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="ticker-chips" aria-label="Selected tickers">
                    {tickers.map((sym) => {
                      const failed = failedByTicker.get(sym);
                      return (
                        <span
                          key={sym}
                          className={`ticker-chip ${failed ? "ticker-chip--failed" : "ticker-chip--ok"}`}
                        >
                          <span className="ticker-chip__label">{sym}</span>
                          {tickers.length > 1 ? (
                            <button
                              type="button"
                              className="ticker-chip__remove"
                              aria-label={`Remove ${sym}`}
                              onClick={() => removeTicker(sym)}
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                  <div className="horizon-buttons" role="group" aria-label="Time horizon">
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
                  <div className="value-mode-buttons" role="group" aria-label="Chart scaling">
                    <button
                      type="button"
                      className={`value-mode-btn ${valueMode === "percent" ? "active" : ""}`}
                      onClick={() => setValueMode("percent")}
                    >
                      % change (indexed)
                    </button>
                    <button
                      type="button"
                      className={`value-mode-btn ${valueMode === "raw" ? "active" : ""}`}
                      onClick={() => setValueMode("raw")}
                    >
                      Close price
                    </button>
                  </div>
                </div>
              </div>
              <div className="chart-container" aria-label="Price comparison chart">
                <PriceChart
                  mode="compare"
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                  rows={comparisonRows}
                  seriesMeta={comparisonMeta}
                  valueMode={valueMode}
                />
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => downloadPricesCsv(primaryData)}
                title="Exports the primary ticker only"
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
