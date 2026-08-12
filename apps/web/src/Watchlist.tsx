type WatchlistProps = {
  tickers: string[];
  activeTicker: string;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
};

export function Watchlist({ tickers, activeTicker, onSelect, onRemove }: WatchlistProps) {
  if (tickers.length === 0) {
    return (
      <section className="watchlist" aria-label="Watchlist">
        <div className="watchlist__row">
          <span className="watchlist__label">Watchlist</span>
          <span className="watchlist__empty">Star a ticker to save it here</span>
        </div>
      </section>
    );
  }

  return (
    <section className="watchlist" aria-label="Watchlist">
      <div className="watchlist__row">
        <span className="watchlist__label">Watchlist</span>
        <ul className="watchlist__chips">
          {tickers.map((ticker) => {
            const isActive = ticker === activeTicker;
            return (
              <li key={ticker} className="watchlist__chip-item">
                <button
                  type="button"
                  className={`watchlist__chip ${isActive ? "watchlist__chip--active" : ""}`}
                  onClick={() => onSelect(ticker)}
                  aria-current={isActive ? "true" : undefined}
                >
                  {ticker}
                </button>
                <button
                  type="button"
                  className="watchlist__remove"
                  onClick={() => onRemove(ticker)}
                  aria-label={`Remove ${ticker} from watchlist`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

type WatchlistToggleProps = {
  ticker: string;
  watched: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export function WatchlistToggle({ ticker, watched, onToggle, disabled }: WatchlistToggleProps) {
  return (
    <button
      type="button"
      className={`watchlist-toggle ${watched ? "watchlist-toggle--on" : ""}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
    >
      <span aria-hidden="true">{watched ? "★" : "☆"}</span>
    </button>
  );
}
