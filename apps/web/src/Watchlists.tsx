import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, TICKER_MAX_LENGTH, type Watchlist } from "@stock/shared";
import {
  addTicker,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  loadState,
  removeTicker,
  renameWatchlist,
  saveState,
  setActiveWatchlist,
  setLastTicker,
  type WatchlistsState,
} from "./watchlistsStorage";

interface WatchlistsProps {
  /** Currently-displayed ticker on the chart. Used to highlight the active chip. */
  currentTicker: string;
  /** Invoked when a user picks a ticker from a list. */
  onSelectTicker: (ticker: string) => void;
}

/**
 * Watchlists side panel. Reads/writes `localStorage` so lists, the active list,
 * and the last-selected ticker survive reloads. The restore on first paint is
 * handled by `App` reading `getInitialTicker(DEFAULT_TICKER)` synchronously
 * into its `ticker` state — that avoids racing two `fetchPrices` calls on
 * mount. Validation mirrors the API's shared `TICKER_REGEX`.
 */
export function Watchlists({ currentTicker, onSelectTicker }: WatchlistsProps) {
  const ids = useId();
  const [state, setState] = useState<WatchlistsState>(() => loadState());
  const [tickerInput, setTickerInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Keep `lastTicker` in sync with whichever ticker the chart is showing,
  // including manual searches that bypass the watchlist chips.
  useEffect(() => {
    setState((s) => (s.lastTicker === currentTicker ? s : setLastTicker(s, currentTicker)));
  }, [currentTicker]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  const active = useMemo(() => getActiveWatchlist(state), [state]);

  const handleSelectTicker = useCallback(
    (ticker: string) => {
      onSelectTicker(ticker);
    },
    [onSelectTicker],
  );

  function onCreate() {
    const name = window.prompt("Name for new watchlist", "New watchlist");
    if (name === null) return;
    setState((s) => createWatchlist(s, name));
  }

  function onDelete(list: Watchlist) {
    const ok = window.confirm(`Delete watchlist "${list.name}"? Tickers in it will be removed.`);
    if (!ok) return;
    setState((s) => deleteWatchlist(s, list.id));
  }

  function startRename(list: Watchlist) {
    setRenaming({ id: list.id, name: list.name });
  }

  function commitRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    setState((s) => renameWatchlist(s, renaming.id, renaming.name));
    setRenaming(null);
  }

  function onAddTicker(e: FormEvent) {
    e.preventDefault();
    if (!active) {
      setAddError("Create a watchlist first.");
      return;
    }
    const { state: next, result } = addTicker(state, active.id, tickerInput);
    if (!result.ok) {
      if (result.reason === "duplicate") setAddError(`${tickerInput.toUpperCase()} is already in this list.`);
      else if (result.reason === "no-list") setAddError("Create a watchlist first.");
      else setAddError("Enter a valid symbol (letters, digits, . - _ ^ =).");
      return;
    }
    setState(next);
    setTickerInput("");
    setAddError(null);
  }

  if (state.watchlists.length === 0) {
    return (
      <section className="watchlists card" aria-labelledby={`${ids}-title`}>
        <header className="watchlists__header">
          <h3 id={`${ids}-title`} className="watchlists__title">Watchlists</h3>
          <button type="button" className="watchlists__action" onClick={onCreate}>
            New
          </button>
        </header>
        <p className="watchlists__empty">
          Create a watchlist to save tickers like {DEFAULT_TICKER} for quick access.
        </p>
      </section>
    );
  }

  return (
    <section className="watchlists card" aria-labelledby={`${ids}-title`}>
      <header className="watchlists__header">
        <h3 id={`${ids}-title`} className="watchlists__title">Watchlists</h3>
        <div className="watchlists__header-actions">
          <label className="sr-only" htmlFor={`${ids}-select`}>Active watchlist</label>
          <select
            id={`${ids}-select`}
            className="watchlists__select"
            value={state.activeId ?? ""}
            onChange={(e) => setState((s) => setActiveWatchlist(s, e.target.value))}
          >
            {state.watchlists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button type="button" className="watchlists__action" onClick={onCreate} title="New watchlist">
            New
          </button>
          {active ? (
            <>
              <button
                type="button"
                className="watchlists__action"
                onClick={() => startRename(active)}
                title="Rename watchlist"
              >
                Rename
              </button>
              <button
                type="button"
                className="watchlists__action watchlists__action--danger"
                onClick={() => onDelete(active)}
                title="Delete watchlist"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </header>

      {renaming ? (
        <form className="watchlists__rename" onSubmit={commitRename}>
          <input
            ref={renameInputRef}
            type="text"
            value={renaming.name}
            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
            className="watchlists__rename-input"
            maxLength={64}
            aria-label="New watchlist name"
          />
          <button type="submit" className="watchlists__action">Save</button>
          <button type="button" className="watchlists__action" onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </form>
      ) : null}

      {active ? (
        <>
          <ul className="watchlists__tickers" aria-label={`Tickers in ${active.name}`}>
            {active.tickers.length === 0 ? (
              <li className="watchlists__hint">No tickers yet. Add one below.</li>
            ) : (
              active.tickers.map((t) => {
                const isCurrent = t === currentTicker;
                return (
                  <li key={t} className="watchlists__ticker">
                    <button
                      type="button"
                      className={`watchlists__chip ${isCurrent ? "is-active" : ""}`}
                      onClick={() => handleSelectTicker(t)}
                      aria-pressed={isCurrent}
                      aria-label={`Load ${t} on chart`}
                    >
                      {t}
                    </button>
                    <button
                      type="button"
                      className="watchlists__remove"
                      onClick={() => setState((s) => removeTicker(s, active.id, t))}
                      aria-label={`Remove ${t} from ${active.name}`}
                      title={`Remove ${t}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <form className="watchlists__add" onSubmit={onAddTicker}>
            <label className="sr-only" htmlFor={`${ids}-add`}>Add ticker</label>
            <input
              id={`${ids}-add`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              className="watchlists__add-input"
              placeholder={`Add ticker (e.g. ${DEFAULT_TICKER})`}
              value={tickerInput}
              onChange={(e) => {
                setTickerInput(e.target.value.toUpperCase());
                if (addError) setAddError(null);
              }}
              maxLength={TICKER_MAX_LENGTH}
            />
            <button type="submit" className="watchlists__action watchlists__action--primary">
              Add
            </button>
          </form>
          {addError ? (
            <p className="watchlists__error" role="alert">{addError}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
