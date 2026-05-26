import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPricesForTickers } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { CompareTickerList } from "./CompareTickerList";
import {
  MAX_COMPARE_TICKERS,
  addTickerToList,
  buildCompareChartRows,
  buildCompareSeries,
  filterSeriesByHorizon,
  removeTickerFromList,
  resolveCompareColor,
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

export default function App() {
  const formId = useId();
  const [selectedTickers, setSelectedTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);
  const [addError, setAddError] = useState<string | null>(null);

  const [seriesByTicker, setSeriesByTicker] = useState<Record<string, GetPricesResponse>>({});
  const [errorsByTicker, setErrorsByTicker] = useState<Record<string, string>>({});
  const [tickerColors, setTickerColors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const horizon = HORIZONS[horizonIndex]!;
  const isCompareMode = selectedTickers.length > 1;

  const load = useCallback(async () => {
    if (selectedTickers.length === 0) {
      setSeriesByTicker({});
      setErrorsByTicker({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const results = await fetchPricesForTickers(selectedTickers, {
      range: horizon.range,
      interval: horizon.interval,
    });

    const nextSeries: Record<string, GetPricesResponse> = {};
    const nextErrors: Record<string, string> = {};

    for (const r of results) {
      if (r.ok) {
        nextSeries[r.ticker] = r.data;
      } else {
        nextErrors[r.ticker] = r.error.error ?? "Request failed";
      }
    }

    setSeriesByTicker(nextSeries);
    setErrorsByTicker(nextErrors);
    setLoading(false);
  }, [selectedTickers, horizon.range, horizon.interval]);

  useEffect(() => {
    void load();
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

  const compareSeries = useMemo(
    () => buildCompareSeries(compareInputs, tickerColors),
    [compareInputs, tickerColors],
  );
  const compareRows = useMemo(() => buildCompareChartRows(compareInputs), [compareInputs]);

  const primaryTicker = selectedTickers[0] ?? DEFAULT_TICKER;
  const primaryData = slicedByTicker[primaryTicker] ?? null;

  const failedTickers = useMemo(
    () => selectedTickers.filter((t) => errorsByTicker[t] != null),
    [selectedTickers, errorsByTicker],
  );

  const hasChartData = isCompareMode ? compareInputs.length > 0 : primaryData != null;
  const allFailed = !loading && selectedTickers.length > 0 && !hasChartData;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const result = addTickerToList(selectedTickers, inputTicker);
    if (result.error) {
      setAddError(result.error);
      return;
    }
    setSelectedTickers(result.tickers);
    setInputTicker("");
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
    setTickerColors((prev) => {
      const copy = { ...prev };
      delete copy[ticker];
      return copy;
    });
  }

  function onTickerColorChange(ticker: string, color: string) {
    setTickerColors((prev) => ({ ...prev, [ticker]: color }));
  }

  const chartVariant = horizonIndex === 0 ? "intraday" : "daily";

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-compare">
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
                onChange={(e) => {
                  setInputTicker(e.target.value.toUpperCase());
                  if (addError) setAddError(null);
                }}
                className="search-input"
                placeholder={`Add ticker (max ${MAX_COMPARE_TICKERS})`}
                maxLength={32}
                aria-describedby={addError ? `${formId}-add-error` : undefined}
              />
              <button
                id={`${formId}-submit`}
                type="submit"
                className="search-btn"
                disabled={loading || selectedTickers.length >= MAX_COMPARE_TICKERS}
              >
                Add
              </button>
            </div>
          </form>
          {addError && (
            <p id={`${formId}-add-error`} className="compare-add-error" role="status">
              {addError}
            </p>
          )}
          <ul className="compare-chips" aria-label="Tickers on chart">
            {selectedTickers.map((t, i) => (
              <li key={t}>
                <span
                  className="compare-chip"
                  style={
                    isCompareMode
                      ? { borderLeftColor: resolveCompareColor(t, i, tickerColors) }
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
        {loading && (
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

        {!loading && hasChartData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  {isCompareMode ? (
                    <CompareTickerList
                      series={compareSeries}
                      dataByTicker={slicedByTicker}
                      colorsByTicker={tickerColors}
                      onColorChange={onTickerColorChange}
                    />
                  ) : (
                    primaryData && (
                      <div className="metrics-inline">
                        <h2 className="ticker-display">{primaryData.ticker}</h2>
                        <span className="metric-badge">
                          {formatLast(primaryData.lastPrice, primaryData.currency)}
                        </span>
                        {(() => {
                          const percentChange = formatPercentChange(primaryData);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive
                            ? "positive"
                            : percentChange.isNegative
                              ? "negative"
                              : "muted";
                          return (
                            <span className={`metric-badge ${statusClass}`}>
                              {percentChange.text}
                            </span>
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
                  <PriceChart
                    compare
                    rows={compareRows}
                    series={compareSeries}
                    variant={chartVariant}
                  />
                ) : (
                  primaryData && <PriceChart data={primaryData} variant={chartVariant} />
                )}
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => {
                  if (primaryData) downloadPricesCsv(primaryData);
                }}
                disabled={!primaryData || isCompareMode}
                title={
                  isCompareMode
                    ? "Export is available for a single ticker only"
                    : "Export CSV"
                }
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
