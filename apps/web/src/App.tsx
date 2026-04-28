import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
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
  { label: "Today", days: 1 },
  { label: "1 Year", days: 365 },
  { label: "5 Year", days: 1825 },
  { label: "All Time", days: Infinity }
];

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchPrices({ ticker });
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setError(res.error.error ?? "Request failed");
      return;
    }
    setData(res.data);
  }, [ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredData = useMemo(() => {
    if (!data) return null;
    const horizon = HORIZONS[horizonIndex].days;
    if (horizon === Infinity) return data;

    const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
    if (!latestTimestamp) return data;

    const cutoff = latestTimestamp - (horizon * 24 * 60 * 60);
    const filteredSeries = data.series.filter(p => p.timestamp >= cutoff);
    
    return {
      ...data,
      series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1)
    };
  }, [data, horizonIndex]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
  }

  return (
    <div className="shell">
      <header className="header">
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
        {loading && (
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

        {!loading && !error && data && filteredData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-inline">
                  <h2 className="ticker-display">{data.ticker}</h2>
                  <span className="metric-badge">{formatLast(data.lastPrice, data.currency)}</span>
                  {(() => {
                    const percentChange = formatPercentChange(filteredData);
                    if (!percentChange) return null;
                    const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                    return (
                      <span className={`metric-badge ${statusClass}`}>
                        {percentChange.text}
                      </span>
                    );
                  })()}
                  
                  <div className="horizon-buttons">
                    {HORIZONS.map((h, i) => (
                      <button
                        key={h.label}
                        className={`horizon-btn ${i === horizonIndex ? 'active' : ''}`}
                        onClick={() => setHorizonIndex(i)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-container" aria-label="Price chart">
                <PriceChart data={filteredData} />
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => downloadPricesCsv(filteredData)}
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
