import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, MAX_COMPARE_TICKERS, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { ComparePriceChart } from "./ComparePriceChart";
import { MarketStrip } from "./MarketStrip";
import { COMPARE_SERIES_COLORS, summarizeLoadResults, type LoadedTickerResult } from "./compareChartData";
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

const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const [seriesByTicker, setSeriesByTicker] = useState<Map<string, GetPricesResponse>>(new Map());
  const [loadFailures, setLoadFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const compareMode = tickers.length > 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const results: LoadedTickerResult[] = await Promise.all(
      tickers.map(async (ticker): Promise<LoadedTickerResult> => {
        const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
        if (!res.ok) {
          return { ok: false, ticker, error: res.error.error ?? "Request failed" };
        }
        return { ok: true, ticker: res.data.ticker, data: res.data };
      }),
    );
    setLoading(false);
    const { successes, failures } = summarizeLoadResults(results);
    setLoadFailures(failures);
    const next = new Map<string, GetPricesResponse>();
    for (const data of successes) {
      next.set(data.ticker, data);
    }
    setSeriesByTicker(next);
    if (successes.length === 0) {
      setError(failures.map((f) => `${f.ticker}: ${f.error}`).join("; ") || "Request failed");
    } else {
      setError(null);
    }
  }, [tickers, horizonIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const horizonDays = HORIZONS[horizonIndex].days;

  const displayDatasets = useMemo(() => {
    return tickers
      .map((t) => seriesByTicker.get(t))
      .filter((d): d is GetPricesResponse => d != null)
      .map((d) => filterSeriesByHorizon(d, horizonDays));
  }, [tickers, seriesByTicker, horizonDays]);

  const primaryData = displayDatasets[0] ?? null;

  function addTicker(raw: string) {
    const t = raw.trim().toUpperCase() || DEFAULT_TICKER;
    if (!TICKER_RE.test(t)) return;
    setTickers((prev) => {
      if (prev.includes(t)) return prev;
      if (prev.length >= MAX_COMPARE_TICKERS) return prev;
      return [...prev, t];
    });
    setInputTicker("");
  }

  function removeTicker(t: string) {
    setTickers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((x) => x !== t);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    addTicker(inputTicker);
  }

  const atCap = tickers.length >= MAX_COMPARE_TICKERS;

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-search-col">
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
                placeholder={atCap ? `Max ${MAX_COMPARE_TICKERS} symbols` : `e.g. MSFT`}
                maxLength={32}
                disabled={atCap}
              />
              <button
                id={`${formId}-submit`}
                type="submit"
                className="search-btn"
                disabled={loading || atCap}
              >
                Add
              </button>
            </div>
          </form>
          <div className="ticker-chips" role="list" aria-label="Compared tickers">
            {tickers.map((t, i) => (
              <span
                key={t}
                className="ticker-chip"
                role="listitem"
                style={{ borderColor: compareMode ? COMPARE_SERIES_COLORS[i % COMPARE_SERIES_COLORS.length] : undefined }}
              >
                <span className="ticker-chip__label">{t}</span>
                {tickers.length > 1 && (
                  <button
                    type="button"
                    className="ticker-chip__remove"
                    onClick={() => removeTicker(t)}
                    aria-label={`Remove ${t}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="main-content">
        {loading && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
             <div className="skeleton-toolbar" />
             <div className="skeleton-chart" />
          </div>
        )}

        {!loading && error && displayDatasets.length === 0 && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {error}
          </div>
        )}

        {!loading && loadFailures.length > 0 && displayDatasets.length > 0 && (
          <div className="card partial-error-banner" role="status">
            <strong>Some symbols failed to load:</strong>{" "}
            {loadFailures.map((f) => `${f.ticker} (${f.error})`).join("; ")}
          </div>
        )}

        {!loading && displayDatasets.length > 0 && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  {compareMode ? (
                    <>
                      <p className="compare-mode-hint">
                        Compare mode: lines show <strong>% change from period start</strong> (indexed for alignment).
                      </p>
                      <div className="metrics-compare-grid">
                        {displayDatasets.map((d, i) => {
                          const pct = formatPercentChange(d);
                          const statusClass = pct?.isPositive
                            ? "positive"
                            : pct?.isNegative
                              ? "negative"
                              : "muted";
                          return (
                            <div key={d.ticker} className="metrics-compare-row">
                              <span
                                className="metrics-compare-swatch"
                                style={{ background: COMPARE_SERIES_COLORS[i % COMPARE_SERIES_COLORS.length] }}
                                aria-hidden
                              />
                              <h2 className="ticker-display ticker-display--sm">{d.ticker}</h2>
                              <span className="metric-badge">{formatLast(d.lastPrice, d.currency)}</span>
                              {pct && (
                                <span className={`metric-badge ${statusClass}`}>{pct.text}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
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
                        className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                        onClick={() => setHorizonIndex(i)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div
                className="chart-container"
                aria-label={compareMode ? "Multi-ticker compare chart" : "Price chart"}
              >
                {compareMode ? (
                  <ComparePriceChart
                    datasets={displayDatasets}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                ) : (
                  primaryData && (
                    <PriceChart
                      data={primaryData}
                      variant={horizonIndex === 0 ? "intraday" : "daily"}
                    />
                  )
                )}
              </div>
            </div>
            {!compareMode && primaryData && (
              <div className="actions-footer">
                <button
                  type="button"
                  className="btn-export"
                  onClick={() => downloadPricesCsv(primaryData)}
                  title="Export CSV"
                >
                  Export CSV
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
