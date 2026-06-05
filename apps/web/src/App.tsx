import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, TICKER_MAX_LENGTH, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  addTickerToActiveWatchlist,
  cleanWatchlistName,
  createDefaultWatchlistState,
  getActiveWatchlist,
  readWatchlistState,
  removeTickerFromActiveWatchlist,
  uniqueWatchlistName,
  validateTickerInput,
  writeWatchlistState,
  type WatchlistState,
} from "./watchlists";
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

function createWatchlistId(): string {
  return `watchlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [watchlistTickerInput, setWatchlistTickerInput] = useState<string>("");
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);
  const [watchlistState, setWatchlistState] = useState<WatchlistState>(() => {
    if (typeof window === "undefined") return createDefaultWatchlistState();
    return readWatchlistState(window.localStorage);
  });
  const activeWatchlist = useMemo(() => getActiveWatchlist(watchlistState), [watchlistState]);
  const [watchlistNameInput, setWatchlistNameInput] = useState<string>(activeWatchlist.name);
  const [watchlistFeedback, setWatchlistFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setError(res.error.error ?? "Request failed");
      return;
    }
    setData(res.data);
  }, [ticker, horizonIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    writeWatchlistState(window.localStorage, watchlistState);
  }, [watchlistState]);

  useEffect(() => {
    setWatchlistNameInput(activeWatchlist.name);
  }, [activeWatchlist.id, activeWatchlist.name]);

  const slicedDaily = useMemo(() => {
    if (!data) return null;
    return filterSeriesByHorizon(data, HORIZONS[horizonIndex].days);
  }, [data, horizonIndex]);

  const displayData = useMemo(() => {
    if (!slicedDaily) return null;
    return slicedDaily;
  }, [slicedDaily]);

  const lastPriceDisplay = displayData?.lastPrice ?? data?.lastPrice ?? null;
  const currencyDisplay = displayData?.currency ?? data?.currency ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const validated = validateTickerInput(inputTicker.trim() ? inputTicker : DEFAULT_TICKER);
    if (!validated.ok) {
      setLoading(false);
      setData(null);
      setError(validated.error);
      return;
    }
    setError(null);
    setInputTicker(validated.ticker);
    setTicker(validated.ticker);
  }

  function selectWatchlistTicker(nextTicker: string) {
    setError(null);
    setInputTicker(nextTicker);
    setTicker(nextTicker);
  }

  function onCreateWatchlist() {
    const id = createWatchlistId();
    setWatchlistState((state) => {
      const name = uniqueWatchlistName(state.watchlists);
      return {
        watchlists: [...state.watchlists, { id, name, tickers: [] }],
        activeWatchlistId: id,
      };
    });
    setWatchlistFeedback({ type: "success", text: "Created watchlist." });
  }

  function onRenameWatchlist(e: FormEvent) {
    e.preventDefault();
    const name = cleanWatchlistName(watchlistNameInput);
    if (!name) {
      setWatchlistFeedback({ type: "error", text: "Watchlist name cannot be empty." });
      return;
    }
    const duplicate = watchlistState.watchlists.some(
      (watchlist) => watchlist.id !== activeWatchlist.id && watchlist.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setWatchlistFeedback({ type: "error", text: "Use a unique watchlist name." });
      return;
    }
    setWatchlistState((state) => ({
      ...state,
      watchlists: state.watchlists.map((watchlist) =>
        watchlist.id === state.activeWatchlistId ? { ...watchlist, name } : watchlist,
      ),
    }));
    setWatchlistFeedback({ type: "success", text: "Renamed watchlist." });
  }

  function onDeleteWatchlist() {
    if (watchlistState.watchlists.length <= 1) return;
    setWatchlistState((state) => {
      const remaining = state.watchlists.filter((watchlist) => watchlist.id !== state.activeWatchlistId);
      return { watchlists: remaining, activeWatchlistId: remaining[0].id };
    });
    setWatchlistFeedback({ type: "success", text: "Deleted watchlist." });
  }

  function onAddTickerToWatchlist(e: FormEvent) {
    e.preventDefault();
    const validated = validateTickerInput(watchlistTickerInput);
    if (!validated.ok) {
      setWatchlistFeedback({ type: "error", text: validated.error });
      return;
    }
    const alreadySaved = activeWatchlist.tickers.includes(validated.ticker);
    setWatchlistState((state) => addTickerToActiveWatchlist(state, validated.ticker));
    setWatchlistTickerInput("");
    setWatchlistFeedback({
      type: alreadySaved ? "error" : "success",
      text: alreadySaved ? `${validated.ticker} is already in this watchlist.` : `Added ${validated.ticker}.`,
    });
  }

  function onRemoveTickerFromWatchlist(nextTicker: string) {
    setWatchlistState((state) => removeTickerFromActiveWatchlist(state, nextTicker));
    setWatchlistFeedback({ type: "success", text: `Removed ${nextTicker}.` });
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
              maxLength={TICKER_MAX_LENGTH}
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
        <section className="card watchlist-card" aria-labelledby={`${formId}-watchlists`}>
          <div className="watchlist-topline">
            <div>
              <h2 id={`${formId}-watchlists`} className="watchlist-title">Watchlists</h2>
              <p className="watchlist-subtitle">Saved in this browser for quick chart switching.</p>
            </div>
            <div className="watchlist-actions">
              <button type="button" className="watchlist-btn" onClick={onCreateWatchlist}>
                New
              </button>
              <button
                type="button"
                className="watchlist-btn danger"
                onClick={onDeleteWatchlist}
                disabled={watchlistState.watchlists.length <= 1}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="watchlist-grid">
            <label className="watchlist-field">
              <span>Current list</span>
              <select
                value={watchlistState.activeWatchlistId}
                onChange={(e) => {
                  setWatchlistState((state) => ({ ...state, activeWatchlistId: e.target.value }));
                  setWatchlistFeedback(null);
                }}
              >
                {watchlistState.watchlists.map((watchlist) => (
                  <option key={watchlist.id} value={watchlist.id}>
                    {watchlist.name}
                  </option>
                ))}
              </select>
            </label>

            <form className="watchlist-inline-form" onSubmit={onRenameWatchlist}>
              <label className="watchlist-field">
                <span>Name</span>
                <input
                  type="text"
                  value={watchlistNameInput}
                  onChange={(e) => setWatchlistNameInput(e.target.value)}
                  maxLength={40}
                />
              </label>
              <button type="submit" className="watchlist-btn">Rename</button>
            </form>

            <form className="watchlist-inline-form" onSubmit={onAddTickerToWatchlist}>
              <label className="watchlist-field">
                <span>Add ticker</span>
                <input
                  type="text"
                  value={watchlistTickerInput}
                  onChange={(e) => setWatchlistTickerInput(e.target.value.toUpperCase())}
                  placeholder="MSFT"
                  maxLength={TICKER_MAX_LENGTH}
                />
              </label>
              <button type="submit" className="watchlist-btn">Add</button>
            </form>
          </div>

          {watchlistFeedback ? (
            <p className={`watchlist-feedback ${watchlistFeedback.type}`} role={watchlistFeedback.type === "error" ? "alert" : "status"}>
              {watchlistFeedback.text}
            </p>
          ) : null}

          <div className="ticker-chip-list" aria-label={`${activeWatchlist.name} tickers`}>
            {activeWatchlist.tickers.length ? (
              activeWatchlist.tickers.map((watchlistTicker) => (
                <span className={`ticker-chip ${watchlistTicker === ticker ? "active" : ""}`} key={watchlistTicker}>
                  <button type="button" onClick={() => selectWatchlistTicker(watchlistTicker)}>
                    {watchlistTicker}
                  </button>
                  <button
                    type="button"
                    className="ticker-chip-remove"
                    onClick={() => onRemoveTickerFromWatchlist(watchlistTicker)}
                    aria-label={`Remove ${watchlistTicker} from ${activeWatchlist.name}`}
                  >
                    Remove
                  </button>
                </span>
              ))
            ) : (
              <span className="watchlist-empty">No tickers saved yet.</span>
            )}
          </div>
        </section>

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

        {!loading && !error && data && displayData && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{data.ticker}</h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(displayData);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                      return (
                        <span className={`metric-badge ${statusClass}`}>
                          {percentChange.text}
                        </span>
                      );
                    })()}
                  </div>
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
                  data={displayData}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </div>
            <div className="actions-footer">
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
