import { useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
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

const MAX_COMPARE_TICKERS = 5;
const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;
const SERIES_COLORS = ["#f54e00", "#2563eb", "#15803d", "#7e22ce", "#b45309"] as const;

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

function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase();
}

function formatLoadErrors(errors: Record<string, string>): string | null {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return entries.map(([ticker, message]) => `${ticker}: ${message}`).join("; ");
}

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const [dataByTicker, setDataByTicker] = useState<Record<string, GetPricesResponse>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadErrors({});
      const horizon = HORIZONS[horizonIndex];
      const responses = await Promise.all(
        tickers.map(async (ticker) => {
          try {
            const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
            return { ticker, res };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Request failed";
            return { ticker, res: { ok: false, error: { error: message, code: "INTERNAL" }, status: 0 } as const };
          }
        }),
      );
      if (cancelled) return;

      const nextData: Record<string, GetPricesResponse> = {};
      const nextErrors: Record<string, string> = {};
      for (const { ticker, res } of responses) {
        if (res.ok) {
          nextData[ticker] = res.data;
        } else {
          nextErrors[ticker] = res.error.error ?? "Request failed";
        }
      }
      setDataByTicker(nextData);
      setLoadErrors(nextErrors);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tickers, horizonIndex]);

  const displaySeries = useMemo(() => {
    return tickers
      .map((ticker) => dataByTicker[ticker])
      .filter((data): data is GetPricesResponse => Boolean(data))
      .map((data) => filterSeriesByHorizon(data, HORIZONS[horizonIndex].days));
  }, [dataByTicker, horizonIndex, tickers]);

  const chartSeries = useMemo(
    () =>
      displaySeries.map((data, index) => ({
        id: `series${index}`,
        ticker: data.ticker,
        color: SERIES_COLORS[index % SERIES_COLORS.length],
        data,
      })),
    [displaySeries],
  );

  const loadErrorSummary = useMemo(() => formatLoadErrors(loadErrors), [loadErrors]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextTicker = normalizeTickerInput(inputTicker);
    setFormError(null);
    if (!nextTicker) {
      setFormError("Enter a ticker to add.");
      return;
    }
    if (!TICKER_RE.test(nextTicker)) {
      setFormError("Use letters, numbers, dots, underscores, carets, equals, or dashes only.");
      return;
    }
    if (tickers.includes(nextTicker)) {
      setFormError(`${nextTicker} is already on the chart.`);
      return;
    }
    if (tickers.length >= MAX_COMPARE_TICKERS) {
      setFormError(`Compare up to ${MAX_COMPARE_TICKERS} tickers at a time.`);
      return;
    }
    setTickers((current) => [...current, nextTicker]);
    setInputTicker("");
  }

  function removeTicker(ticker: string) {
    if (tickers.length === 1) return;
    setTickers((current) => current.filter((item) => item !== ticker));
    setLoadErrors((current) => {
      const { [ticker]: _removed, ...rest } = current;
      return rest;
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
              placeholder="Add ticker"
              maxLength={32}
            />
            <button
              id={`${formId}-submit`}
              type="submit"
              className="search-btn"
              disabled={loading}
            >
              Add
            </button>
          </div>
          {formError ? (
            <p className="search-error" role="alert">{formError}</p>
          ) : (
            <p className="compare-help">Compare up to {MAX_COMPARE_TICKERS} symbols. Multi-symbol charts are indexed to 100 at each ticker&apos;s first visible close.</p>
          )}
          <div className="ticker-chips" aria-label="Selected tickers">
            {tickers.map((ticker) => (
              <span key={ticker} className="ticker-chip">
                {ticker}
                <button
                  type="button"
                  aria-label={`Remove ${ticker}`}
                  onClick={() => removeTicker(ticker)}
                  disabled={tickers.length === 1 || loading}
                >
                  &times;
                </button>
              </span>
            ))}
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

        {!loading && displaySeries.length === 0 && loadErrorSummary && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {loadErrorSummary}
          </div>
        )}

        {!loading && displaySeries.length > 0 && (
          <>
            {loadErrorSummary && (
              <div className="card warning-banner" role="status">
                <strong>Some tickers failed.</strong> {loadErrorSummary}
              </div>
            )}
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{displaySeries.map((item) => item.ticker).join(" / ")}</h2>
                    <div className="series-metrics" aria-label="Series metrics">
                      {displaySeries.map((item, index) => {
                        const percentChange = formatPercentChange(item);
                        const statusClass = percentChange?.isPositive ? "positive" : percentChange?.isNegative ? "negative" : "muted";
                        return (
                          <span key={item.ticker} className={`metric-badge series-badge ${statusClass}`}>
                            <span className="metric-swatch" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                            {item.ticker} {formatLast(item.lastPrice, item.currency)}
                            {percentChange ? ` ${percentChange.text}` : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <p className="chart-note">
                    {displaySeries.length > 1
                      ? "Compare mode indexes each line to 100 at its first visible close."
                      : "Single-symbol mode shows absolute close price."}
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
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  series={chartSeries}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </div>
            {displaySeries.length === 1 && (
              <div className="actions-footer">
                <button
                  type="button"
                  className="btn-export"
                  onClick={() => downloadPricesCsv(displaySeries[0])}
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
