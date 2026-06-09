import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  buildComparisonRows,
  COMPARE_LINE_COLORS,
  createCompareTickerList,
  normalizeComparisonSeries,
  summarizeComparisonResults,
  type TickerFetchResult,
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
  const compareFormId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState("");
  const [compareNotice, setCompareNotice] = useState<string | null>(null);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [successfulData, setSuccessfulData] = useState<GetPricesResponse[]>([]);
  const [failures, setFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    setCompareNotice(null);
    const horizon = HORIZONS[horizonIndex];
    const settled = await Promise.all(
      tickers.map(async (ticker): Promise<TickerFetchResult> => {
        const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
        if (!res.ok) {
          return { ticker, ok: false, error: res.error.error ?? "Request failed" };
        }
        return { ticker, ok: true, data: res.data };
      }),
    );
    const summary = summarizeComparisonResults(settled);
    setLoading(false);
    setSuccessfulData(summary.successful);
    setFailures(summary.failures);
    if (summary.successful.length === 0) {
      setFatalError(
        summary.failures.length === 1
          ? summary.failures[0]!.error
          : "Could not load data for any selected ticker",
      );
    }
  }, [tickers, horizonIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const slicedData = useMemo(() => {
    const horizonDays = HORIZONS[horizonIndex].days;
    return successfulData.map((d) => filterSeriesByHorizon(d, horizonDays));
  }, [successfulData, horizonIndex]);

  const primaryData = slicedData[0] ?? null;
  const isMultiTicker = tickers.length > 1;

  const chartSeries = useMemo(
    () =>
      slicedData.map((d, i) => ({
        ticker: d.ticker,
        color: COMPARE_LINE_COLORS[i % COMPARE_LINE_COLORS.length]!,
      })),
    [slicedData],
  );

  const chartRows = useMemo(() => {
    const seriesByTicker: Record<string, ReturnType<typeof normalizeComparisonSeries>> = {};
    for (const d of slicedData) {
      if (isMultiTicker) {
        seriesByTicker[d.ticker] = normalizeComparisonSeries(d.series);
      } else {
        seriesByTicker[d.ticker] = d.series.map((p) => ({ timestamp: p.timestamp, value: p.close }));
      }
    }
    return buildComparisonRows(seriesByTicker);
  }, [slicedData, isMultiTicker]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTickers((prev) => {
      const rest = prev.slice(1);
      if (rest.includes(t)) return [t, ...rest.filter((x) => x !== t)];
      return [t, ...rest];
    });
    setInputTicker(t);
  }

  function onAddCompare(e: FormEvent) {
    e.preventDefault();
    const result = createCompareTickerList(tickers, compareInput);
    if (result.error) {
      setCompareNotice(result.error);
      return;
    }
    setTickers(result.tickers);
    setCompareInput("");
    setCompareNotice(null);
  }

  function removeTicker(ticker: string) {
    if (tickers.length <= 1) return;
    setTickers((prev) => prev.filter((t) => t !== ticker));
    setCompareNotice(null);
  }

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
            <button id={`${formId}-submit`} type="submit" className="search-btn" disabled={loading}>
              Search
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

        {!loading && fatalError && successfulData.length === 0 && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {fatalError}
          </div>
        )}

        {!loading && successfulData.length > 0 && (
          <>
            {!loading && failures.length > 0 && (
              <div className="card partial-error-banner" role="status">
                <strong>Some symbols failed to load:</strong>{" "}
                {failures.map((f) => `${f.ticker} (${f.error})`).join("; ")}
              </div>
            )}

            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    {isMultiTicker ? (
                      <div className="compare-chips" role="list" aria-label="Compared tickers">
                        {slicedData.map((d, i) => {
                          const pct = formatPercentChange(d);
                          const statusClass = pct?.isPositive
                            ? "positive"
                            : pct?.isNegative
                              ? "negative"
                              : "muted";
                          return (
                            <div
                              key={d.ticker}
                              className="compare-chip"
                              role="listitem"
                              style={{ borderColor: COMPARE_LINE_COLORS[i % COMPARE_LINE_COLORS.length] }}
                            >
                              <span className="compare-chip__ticker">{d.ticker}</span>
                              <span className="compare-chip__price">
                                {formatLast(d.lastPrice, d.currency)}
                              </span>
                              {pct && (
                                <span className={`compare-chip__pct ${statusClass}`}>{pct.text}</span>
                              )}
                              {tickers.length > 1 && (
                                <button
                                  type="button"
                                  className="compare-chip__remove"
                                  onClick={() => removeTicker(d.ticker)}
                                  aria-label={`Remove ${d.ticker} from chart`}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <h2 className="ticker-display">{primaryData!.ticker}</h2>
                        <span className="metric-badge">
                          {formatLast(primaryData!.lastPrice, primaryData!.currency)}
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
                            <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>
                          );
                        })()}
                      </>
                    )}
                  </div>

                  <form
                    className="compare-form"
                    onSubmit={onAddCompare}
                    aria-labelledby={`${compareFormId}-legend`}
                  >
                    <label id={`${compareFormId}-legend`} htmlFor={`${compareFormId}-compare`} className="sr-only">
                      Add ticker to compare
                    </label>
                    <div className="compare-input-wrapper">
                      <input
                        id={`${compareFormId}-compare`}
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={compareInput}
                        onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                        className="compare-input"
                        placeholder="Add compare ticker"
                        maxLength={32}
                        disabled={loading}
                      />
                      <button type="submit" className="compare-add-btn" disabled={loading}>
                        Compare
                      </button>
                    </div>
                    {compareNotice && (
                      <p className="compare-notice" role="status">
                        {compareNotice}
                      </p>
                    )}
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
                  {isMultiTicker && (
                    <p className="compare-mode-note muted">
                      Chart shows percent change from horizon start for each symbol.
                    </p>
                  )}
                </div>
              </div>
              <div className="chart-container" aria-label="Price chart">
                <PriceChart
                  rows={chartRows}
                  series={chartSeries}
                  normalized={isMultiTicker}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </div>
            <div className="actions-footer">
              {isMultiTicker ? (
                <span className="export-hint muted">
                  Export CSV is available for the primary symbol ({primaryData!.ticker}) only.
                </span>
              ) : null}
              <button
                type="button"
                className="btn-export"
                onClick={() => primaryData && downloadPricesCsv(primaryData)}
                title={isMultiTicker ? `Export ${primaryData!.ticker} CSV` : "Export CSV"}
                disabled={!primaryData}
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
