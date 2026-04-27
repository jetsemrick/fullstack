import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, MAX_COMPARE_TICKERS, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import {
  mergeTimeAlignedIndexedPercent,
  type FetchSeriesResult,
} from "./mergeChartSeries";
import { PriceChart } from "./PriceChart";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function normalizeTickerInput(raw: string): string {
  return raw.trim().toUpperCase() || DEFAULT_TICKER;
}

function uniqueTickers(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const u = t.trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export default function App() {
  const formId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);

  const [seriesByTicker, setSeriesByTicker] = useState<Map<string, GetPricesResponse>>(new Map());
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map());
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFatalError(null);
    const nextSeries = new Map<string, GetPricesResponse>();
    const nextErrors = new Map<string, string>();

    const results = await Promise.all(
      tickers.map(async (requested): Promise<FetchSeriesResult> => {
        const res = await fetchPrices({ ticker: requested });
        if (!res.ok) {
          return { ok: false, ticker: requested, error: res.error.error ?? "Request failed" };
        }
        if (res.data.series.length === 0) {
          return { ok: false, ticker: requested, error: "No data" };
        }
        nextSeries.set(requested, res.data);
        return { ok: true, ticker: requested, series: res.data.series };
      }),
    );

    for (const r of results) {
      if (!r.ok) {
        nextErrors.set(r.ticker, r.error);
        nextSeries.delete(r.ticker);
      }
    }

    setSeriesByTicker(nextSeries);
    setLoadErrors(nextErrors);

    if (nextSeries.size === 0) {
      if (nextErrors.size === tickers.length) {
        const first = tickers[0];
        setFatalError(nextErrors.get(first) ?? "Could not load data");
      } else {
        setFatalError("No series could be charted.");
      }
    }

    setLoading(false);
  }, [tickers]);

  useEffect(() => {
    // Defer fetch so initial setState runs outside the effect body (react-hooks/set-state-in-effect).
    const id = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(id);
  }, [load]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = normalizeTickerInput(inputTicker);
    setTickers((prev) => uniqueTickers([...prev, t]).slice(0, MAX_COMPARE_TICKERS));
    setInputTicker(t);
  }

  function removeTicker(t: string) {
    setTickers((prev) => {
      const next = prev.filter((x) => x !== t);
      return next.length > 0 ? next : [DEFAULT_TICKER];
    });
  }

  const fetchResults: FetchSeriesResult[] = tickers.map((t) => {
    const err = loadErrors.get(t);
    if (err) return { ok: false, ticker: t, error: err };
    const data = seriesByTicker.get(t);
    if (!data) return { ok: false, ticker: t, error: "Not loaded" };
    return { ok: true, ticker: data.ticker, series: data.series };
  });

  const { rows: mergedRows, tickersOnChart, failed: mergeFailed } = mergeTimeAlignedIndexedPercent(fetchResults);
  const mergeFailedMap = new Map(mergeFailed.map((f) => [f.ticker, f.error]));

  const showChart = !loading && !fatalError && tickersOnChart.length > 0;
  const compareMode = tickersOnChart.length >= 2;
  const partialWarnings: { ticker: string; message: string }[] = [];
  for (const t of tickers) {
    const loadMsg = loadErrors.get(t);
    if (loadMsg) {
      partialWarnings.push({ ticker: t, message: loadMsg });
      continue;
    }
    const mergeMsg = mergeFailedMap.get(t);
    if (mergeMsg && !tickersOnChart.includes(t)) {
      partialWarnings.push({ ticker: t, message: mergeMsg });
    }
  }

  const primaryTicker = tickersOnChart[0] ?? tickers[0];
  const primaryData = primaryTicker ? seriesByTicker.get(primaryTicker) : undefined;

  return (
    <div className="shell">
      <header className="header">
        <div>
          <h1 className="title">Stock Visualizer</h1>
        </div>
      </header>

      <section className="panel card controls" aria-labelledby={`${formId}-legend`}>
        <h2 id={`${formId}-legend`} className="sr-only">
          Tickers
        </h2>
        <form className="form-row" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor={`${formId}-ticker`}>Add ticker</label>
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
              disabled={loading || tickers.length >= MAX_COMPARE_TICKERS}
            >
              Add / refresh
            </button>
          </div>
        </form>
        <p className="hint muted">
          Up to <strong>{MAX_COMPARE_TICKERS}</strong> symbols on one chart. Submit adds the symbol (or refreshes the
          set). Remove chips to drop a line. Compare view uses <strong>indexed %</strong> (each series starts at 100%
          from its first valid close in the window). Same-origin API: parallel <code className="inline-code">GET /api/prices</code> per symbol.
        </p>
        <div className="ticker-chip-row" aria-label="Selected tickers">
          {tickers.map((t) => (
            <span key={t} className="ticker-chip">
              {t}
              <button
                type="button"
                className="ticker-chip-remove"
                aria-label={`Remove ${t}`}
                onClick={() => removeTicker(t)}
                disabled={loading}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {loading && (
        <div className="skeleton-grid" aria-busy="true" aria-label="Loading chart">
          <div className="skeleton card" style={{ height: 88 }} />
          <div className="skeleton card" style={{ height: 88 }} />
          <div className="skeleton card chart-skel" />
        </div>
      )}

      {!loading && fatalError && (
        <div className="card error-banner" role="alert">
          <strong>Could not load data.</strong> {fatalError}
        </div>
      )}

      {!loading && !fatalError && showChart && partialWarnings.length > 0 && (
        <div className="card warn-banner" role="status">
          <strong>Some symbols did not load.</strong> Chart shows {tickersOnChart.join(", ")}.
          <ul>
            {partialWarnings.map(({ ticker, message }) => (
              <li key={ticker}>
                <strong>{ticker}:</strong> {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && !fatalError && showChart && (
        <>
          {compareMode && (
            <p className="chart-mode-hint muted card" style={{ padding: "0.65rem 1rem", marginBottom: "0.75rem" }}>
              Y-axis: percent of each symbol&apos;s first valid close in the window (100% = start). Days align by
              calendar date; missing bars appear as gaps per series.
            </p>
          )}
          <div className="metrics-row">
            <div className="metrics">
              {primaryData && (
                <>
                  <div className="card metric">
                    <span className="metric-label">Symbol</span>
                    <span className="metric-value">{compareMode ? tickersOnChart.join(", ") : primaryData.ticker}</span>
                  </div>
                  <div className="card metric">
                    <span className="metric-label">Last ({primaryData.ticker})</span>
                    <span className="metric-value tabular">{formatLast(primaryData.lastPrice, primaryData.currency)}</span>
                  </div>
                  <div className="card metric">
                    <span className="metric-label">Points ({primaryData.ticker})</span>
                    <span className="metric-value tabular">{primaryData.series.length.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
            <div className="export-wrap">
              {primaryData && (
                <button type="button" className="btn btn-secondary" onClick={() => downloadPricesCsv(primaryData)}>
                  Export CSV
                </button>
              )}
              <span className="export-hint muted">CSV is for the first successful symbol in the list</span>
            </div>
          </div>
          <section className="card chart-card" aria-label="Price chart">
            {compareMode ? (
              <PriceChart mode="compare" rows={mergedRows} tickers={tickersOnChart} />
            ) : primaryData ? (
              <PriceChart mode="single" data={primaryData} />
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
