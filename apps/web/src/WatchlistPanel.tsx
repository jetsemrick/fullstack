import { useCallback, useId, useState, type FormEvent } from "react";
import { TICKER_MAX_LENGTH } from "@stock/shared";
import {
  addSymbolToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  loadWatchlistsState,
  removeSymbolFromWatchlist,
  renameWatchlist,
  saveWatchlistsState,
  setActiveWatchlist,
  type WatchlistsState,
} from "./watchlists";

type WatchlistPanelProps = {
  onSelectTicker: (ticker: string) => void;
};

export function WatchlistPanel({ onSelectTicker }: WatchlistPanelProps) {
  const panelId = useId();
  const [state, setState] = useState<WatchlistsState>(() => loadWatchlistsState(localStorage));
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const persist = useCallback((next: WatchlistsState) => {
    setState(next);
    saveWatchlistsState(localStorage, next);
  }, []);

  const active = getActiveWatchlist(state);

  function onAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setAddError(null);
    const result = addSymbolToWatchlist(state, active.id, addInput);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    persist(result.state);
    setAddInput("");
    onSelectTicker(result.symbol);
  }

  function onCreate() {
    const name = window.prompt("Watchlist name", "New watchlist");
    if (name === null) return;
    persist(createWatchlist(state, name));
    setRenameError(null);
  }

  function onRename() {
    if (!active) return;
    const name = window.prompt("Rename watchlist", active.name);
    if (name === null) return;
    if (!name.trim()) {
      setRenameError("Name cannot be empty");
      return;
    }
    setRenameError(null);
    persist(renameWatchlist(state, active.id, name));
  }

  function onDelete() {
    if (!active) return;
    if (state.watchlists.length <= 1) {
      window.alert("Keep at least one watchlist.");
      return;
    }
    if (!window.confirm(`Delete "${active.name}"?`)) return;
    persist(deleteWatchlist(state, active.id));
  }

  if (!active) return null;

  return (
    <section className="card watchlist-panel" aria-labelledby={`${panelId}-heading`}>
      <div className="watchlist-toolbar">
        <h2 id={`${panelId}-heading`} className="watchlist-heading">
          Watchlists
        </h2>
        <div className="watchlist-controls">
          <label htmlFor={`${panelId}-select`} className="sr-only">
            Active watchlist
          </label>
          <select
            id={`${panelId}-select`}
            className="watchlist-select"
            value={active.id}
            onChange={(e) => persist(setActiveWatchlist(state, e.target.value))}
          >
            {state.watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button type="button" className="watchlist-action-btn" onClick={onCreate}>
            New
          </button>
          <button type="button" className="watchlist-action-btn" onClick={onRename}>
            Rename
          </button>
          <button type="button" className="watchlist-action-btn watchlist-action-btn--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {renameError && (
        <p className="watchlist-inline-error" role="alert">
          {renameError}
        </p>
      )}

      <form className="watchlist-add-form" onSubmit={onAddSubmit}>
        <label htmlFor={`${panelId}-add`} className="sr-only">
          Add symbol to watchlist
        </label>
        <input
          id={`${panelId}-add`}
          type="text"
          className="watchlist-add-input"
          placeholder="Add symbol"
          value={addInput}
          maxLength={TICKER_MAX_LENGTH}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setAddInput(e.target.value.toUpperCase());
            setAddError(null);
          }}
        />
        <button type="submit" className="watchlist-add-btn">
          Add
        </button>
      </form>
      {addError && (
        <p className="watchlist-inline-error" role="alert">
          {addError}
        </p>
      )}

      {active.symbols.length === 0 ? (
        <p className="watchlist-empty">No symbols yet. Add a ticker or use Search above.</p>
      ) : (
        <ul className="watchlist-symbols" role="list">
          {active.symbols.map((symbol) => (
            <li key={symbol}>
              <button
                type="button"
                className="watchlist-symbol-btn"
                onClick={() => onSelectTicker(symbol)}
              >
                {symbol}
              </button>
              <button
                type="button"
                className="watchlist-remove-btn"
                aria-label={`Remove ${symbol} from watchlist`}
                onClick={() => persist(removeSymbolFromWatchlist(state, active.id, symbol))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
