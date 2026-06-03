import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TICKER_MAX_LENGTH } from "@stock/shared";
import {
  addTickerToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  loadWatchlistsState,
  removeTickerFromWatchlist,
  renameWatchlist,
  saveWatchlistsState,
  setActiveWatchlist,
  setLastTicker,
  type WatchlistsState,
} from "./watchlistsStorage";

interface WatchlistsProps {
  currentTicker: string;
  onSelectTicker: (ticker: string) => void;
}

export function Watchlists({ currentTicker, onSelectTicker }: WatchlistsProps) {
  const [state, setState] = useState<WatchlistsState>(() => loadWatchlistsState());
  const activeWatchlist = useMemo(() => getActiveWatchlist(state), [state]);
  const [watchlistName, setWatchlistName] = useState(activeWatchlist.name);
  const [tickerInput, setTickerInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setWatchlistName(activeWatchlist.name);
  }, [activeWatchlist.id, activeWatchlist.name]);

  useEffect(() => {
    setState((prev) => setLastTicker(prev, currentTicker));
  }, [currentTicker]);

  useEffect(() => {
    saveWatchlistsState(state);
  }, [state]);

  function applyResult(result: ReturnType<typeof createWatchlist>) {
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setState(result.state);
    setMessage(null);
  }

  function onCreateWatchlist() {
    applyResult(createWatchlist(state, watchlistName));
  }

  function onRenameWatchlist() {
    applyResult(renameWatchlist(state, activeWatchlist.id, watchlistName));
  }

  function onDeleteWatchlist() {
    setState(deleteWatchlist(state, activeWatchlist.id));
    setMessage(null);
  }

  function onAddTicker(e: FormEvent) {
    e.preventDefault();
    const result = addTickerToWatchlist(state, activeWatchlist.id, tickerInput);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setState(result.state);
    setTickerInput("");
    setMessage(null);
  }

  function onRemoveTicker(ticker: string) {
    setState(removeTickerFromWatchlist(state, activeWatchlist.id, ticker));
    setMessage(null);
  }

  return (
    <section className="card watchlists-card" aria-labelledby="watchlists-heading">
      <div className="watchlists-header">
        <div>
          <h2 id="watchlists-heading" className="watchlists-title">Watchlists</h2>
          <p className="watchlists-subtitle">Save symbols locally and switch the chart with one click.</p>
        </div>
        <label className="watchlists-select-label">
          <span className="sr-only">Active watchlist</span>
          <select
            className="watchlists-select"
            value={state.activeWatchlistId}
            onChange={(e) => {
              setState(setActiveWatchlist(state, e.target.value));
              setMessage(null);
            }}
          >
            {state.watchlists.map((watchlist) => (
              <option key={watchlist.id} value={watchlist.id}>
                {watchlist.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="watchlists-controls">
        <label className="watchlists-name-field">
          <span className="watchlists-label">List name</span>
          <input
            className="watchlists-input"
            value={watchlistName}
            onChange={(e) => setWatchlistName(e.target.value)}
            maxLength={40}
          />
        </label>
        <div className="watchlists-actions">
          <button type="button" className="watchlists-btn" onClick={onCreateWatchlist}>
            New
          </button>
          <button type="button" className="watchlists-btn" onClick={onRenameWatchlist}>
            Rename
          </button>
          <button type="button" className="watchlists-btn watchlists-btn--danger" onClick={onDeleteWatchlist}>
            Delete
          </button>
        </div>
      </div>

      <form className="watchlists-add-form" onSubmit={onAddTicker}>
        <label className="watchlists-symbol-field">
          <span className="watchlists-label">Add ticker</span>
          <input
            className="watchlists-input"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="MSFT"
            spellCheck={false}
            autoComplete="off"
            maxLength={TICKER_MAX_LENGTH}
          />
        </label>
        <button type="submit" className="watchlists-btn watchlists-btn--primary">
          Add
        </button>
      </form>

      {message && (
        <p className="watchlists-message" role="alert">
          {message}
        </p>
      )}

      {activeWatchlist.tickers.length > 0 ? (
        <ul className="watchlists-tickers" aria-label={`${activeWatchlist.name} tickers`}>
          {activeWatchlist.tickers.map((ticker) => (
            <li key={ticker} className="watchlists-ticker-item">
              <button
                type="button"
                className={`watchlists-chip ${ticker === currentTicker ? "active" : ""}`}
                onClick={() => onSelectTicker(ticker)}
              >
                {ticker}
              </button>
              <button
                type="button"
                className="watchlists-remove"
                onClick={() => onRemoveTicker(ticker)}
                aria-label={`Remove ${ticker} from ${activeWatchlist.name}`}
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="watchlists-empty">No symbols yet. Add a ticker to start this watchlist.</p>
      )}
    </section>
  );
}
