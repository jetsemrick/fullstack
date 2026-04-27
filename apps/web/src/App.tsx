import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
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

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);

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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
  }

  return (
    <div className="shell">
      <header className="header">
        <div>
          <h1 className="title">Stock Visualizer</h1>
        </div>
      </header>

      <section className="panel card controls" aria-labelledby={`${formId}-legend`}>
        <h2 id={`${formId}-legend`} className="sr-only">
          Ticker
        </h2>
        <form className="form-row" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor={`${formId}-ticker`}>Ticker</label>
            <input
              id={`${formId}-ticker`}
              name="ticker"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={inputTicker}
              onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
              className="input"
              maxLength={32}
            />
          </div>
          <div className="field actions">
            <label className="label-spacer" htmlFor={`${formId}-submit`}>
              &nbsp;
            </label>
            <button
              id={`${formId}-submit`}
              type="submit"
              className="btn"
              disabled={loading}
            >
              Update
            </button>
          </div>
        </form>
        <p className="hint muted">
          Default ticker is <strong>{DEFAULT_TICKER}</strong>. Submit to load a different symbol.
        </p>
      </section>

      {loading && (
        <div className="skeleton-grid" aria-busy="true" aria-label="Loading chart">
          <div className="skeleton card" style={{ height: 88 }} />
          <div className="skeleton card" style={{ height: 88 }} />
          <div className="skeleton card chart-skel" />
        </div>
      )}

      {!loading && error && (
        <div className="card error-banner" role="alert">
          <strong>Could not load data.</strong> {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="metrics-row">
            <div className="metrics">
              <div className="card metric">
                <span className="metric-label">Symbol</span>
                <span className="metric-value">{data.ticker}</span>
              </div>
              <div className="card metric">
                <span className="metric-label">Last</span>
                <span className="metric-value tabular">{formatLast(data.lastPrice, data.currency)}</span>
              </div>
              <div className="card metric">
                <span className="metric-label">Points</span>
                <span className="metric-value tabular">{data.series.length.toLocaleString()}</span>
              </div>
            </div>
            <div className="export-wrap">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => downloadPricesCsv(data)}
              >
                Export CSV
              </button>
              <span className="export-hint muted">One row per day in the loaded series</span>
            </div>
          </div>
          <section className="card chart-card" aria-label="Price chart">
            <PriceChart data={data} />
          </section>
        </>
      )}
    </div>
  );
}
