import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { TICKER_MAX_LENGTH } from "@stock/shared";
import {
  addTickerToActiveWatchlist,
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
  loading: boolean;
  onSelectTicker: (ticker: string) => void;
}

export function Watchlists({ currentTicker, loading, onSelectTicker }: WatchlistsProps) {
  const id = useId();
  const [state, setState] = useState<WatchlistsState>(() => loadWatchlistsState());
  const [tickerInput, setTickerInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const currentState = useMemo(() => setLastTicker(state, currentTicker), [state, currentTicker]);
  const activeWatchlist = useMemo(() => getActiveWatchlist(currentState), [currentState]);

  useEffect(() => {
    saveWatchlistsState(currentState);
  }, [currentState]);

  function updateState(next: WatchlistsState) {
    setMessage(null);
    setState(next);
  }

  function onCreateWatchlist() {
    const name = window.prompt("Watchlist name", "My Watchlist");
    if (name === null) return;
    updateState(createWatchlist(currentState, name));
  }

  function onRenameWatchlist() {
    if (!activeWatchlist) return;
    const name = window.prompt("Rename watchlist", activeWatchlist.name);
    if (name === null) return;
    updateState(renameWatchlist(currentState, activeWatchlist.id, name));
  }

  function onDeleteWatchlist() {
    if (!activeWatchlist) return;
    const ok = window.confirm(`Delete "${activeWatchlist.name}"?`);
    if (!ok) return;
    updateState(deleteWatchlist(currentState, activeWatchlist.id));
  }

  function onAddTicker(e: FormEvent) {
    e.preventDefault();
    const result = addTickerToActiveWatchlist(currentState, tickerInput);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setTickerInput("");
    updateState(result.state);
    onSelectTicker(result.ticker);
  }

  function onRemoveTicker(ticker: string) {
    if (!activeWatchlist) return;
    updateState(removeTickerFromWatchlist(currentState, activeWatchlist.id, ticker));
  }

  function onTickerInputChange(value: string) {
    setTickerInput(value.toUpperCase());
    setMessage(null);
  }

  function onWatchlistTickerSelect(symbol: string) {
    setMessage(null);
    setTickerInput("");
    onSelectTicker(symbol);
  }

  return (
    <section className="card watchlists-card" aria-labelledby={`${id}-heading`}>
      <div className="watchlists-header">
        <div>
          <p className="eyebrow">Watchlists</p>
          <h2 id={`${id}-heading`} className="watchlists-title">Saved symbols</h2>
        </div>
        <div className="watchlists-actions">
          <button type="button" className="secondary-btn" onClick={onCreateWatchlist}>New</button>
          <button type="button" className="secondary-btn" onClick={onRenameWatchlist} disabled={!activeWatchlist}>Rename</button>
          <button type="button" className="secondary-btn danger" onClick={onDeleteWatchlist} disabled={!activeWatchlist}>Delete</button>
        </div>
      </div>

      <div className="watchlists-controls">
        <label className="watchlists-select-label" htmlFor={`${id}-select`}>Active list</label>
        <select
          id={`${id}-select`}
          className="watchlists-select"
          value={currentState.activeWatchlistId ?? ""}
          onChange={(e) => updateState(setActiveWatchlist(currentState, e.target.value))}
          disabled={currentState.watchlists.length === 0}
        >
          {currentState.watchlists.length === 0 ? (
            <option value="">No watchlists yet</option>
          ) : (
            currentState.watchlists.map((watchlist) => (
              <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>
            ))
          )}
        </select>
      </div>

      {activeWatchlist ? (
        <>
          <form className="watchlists-add-form" onSubmit={onAddTicker}>
            <label htmlFor={`${id}-ticker`} className="sr-only">Add ticker to watchlist</label>
            <input
              id={`${id}-ticker`}
              type="text"
              value={tickerInput}
              onChange={(e) => onTickerInputChange(e.target.value)}
              className="watchlists-input"
              placeholder="Add ticker"
              maxLength={TICKER_MAX_LENGTH}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="search-btn" disabled={loading}>Add</button>
          </form>
          {message && <p className="watchlists-message" role="alert">{message}</p>}
          <div className="watchlists-tickers" aria-label={`${activeWatchlist.name} tickers`}>
            {activeWatchlist.tickers.length === 0 ? (
              <p className="watchlists-empty">Add a ticker to start this watchlist.</p>
            ) : (
              activeWatchlist.tickers.map((symbol) => (
                <span key={symbol} className={`watchlist-chip ${symbol === currentTicker ? "active" : ""}`}>
                  <button
                    type="button"
                    className="watchlist-chip-main"
                    onClick={() => onWatchlistTickerSelect(symbol)}
                    disabled={loading}
                    aria-pressed={symbol === currentTicker}
                  >
                    {symbol}
                  </button>
                  <button
                    type="button"
                    className="watchlist-chip-remove"
                    onClick={() => onRemoveTicker(symbol)}
                    aria-label={`Remove ${symbol} from ${activeWatchlist.name}`}
                  >
                    Remove
                  </button>
                </span>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="watchlists-empty">Create a watchlist to save symbols and switch charts quickly.</p>
      )}
    </section>
  );
}
