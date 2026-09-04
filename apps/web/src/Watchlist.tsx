import { WATCHLIST_MAX } from "./watchlistStorage";

type WatchlistProps = {
  tickers: string[];
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
};

export function Watchlist({ tickers, selectedTicker, onSelect }: WatchlistProps) {
  const isFull = tickers.length >= WATCHLIST_MAX;
  const selected = selectedTicker?.toUpperCase() ?? null;

  return (
    <section className="watchlist" aria-label="Watchlist">
      <div className="watchlist__header">
        <h2 className="watchlist__label">Watchlist</h2>
        {isFull ? (
          <p className="watchlist__hint" role="status">
            Watchlist is full ({WATCHLIST_MAX} tickers).
          </p>
        ) : null}
      </div>
      {tickers.length === 0 ? (
        <p className="watchlist__empty">No tickers yet. Add the current chart symbol to start a watchlist.</p>
      ) : (
        <ul className="watchlist__chips">
          {tickers.map((ticker) => {
            const isActive = ticker === selected;
            return (
              <li key={ticker}>
                <button
                  type="button"
                  className={`watchlist__chip${isActive ? " watchlist__chip--active" : ""}`}
                  aria-pressed={isActive}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onSelect(ticker)}
                >
                  {ticker}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
