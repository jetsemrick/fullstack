import { useEffect, useMemo, useState } from "react";
import { SP_TAPE_SYMBOLS, type TickerTapeQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

/** Same cadence as `MarketStrip` so the tape and index chips refresh together. */
const TAPE_REFRESH_MS = 60_000;

function formatTapePrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTapePct(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(2)}%`;
}

function pctClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__pct ticker-tape__pct--muted";
  }
  return changePercent > 0 ? "ticker-tape__pct ticker-tape__pct--up" : "ticker-tape__pct ticker-tape__pct--down";
}

function TapeItem({ quote }: { quote: TickerTapeQuote }) {
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatTapePrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatTapePct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Full-width S&P large-cap tape above the page header.
 *
 * Accessibility: the moving marquee is decorative (`aria-hidden`). An infinite
 * duplicated strip is not a useful focus target and would be announced twice.
 * The same quotes live in a static list for assistive tech. Under
 * `prefers-reduced-motion: reduce`, that list replaces the marquee and scrolls
 * horizontally; the animation does not run.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchTickerTape();
        if (cancelled) return;
        if (res.ok && Array.isArray(res.data.quotes)) {
          setQuotes(res.data.quotes);
          setUnavailable(false);
          return;
        }
        setUnavailable(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    }
    void load();
    const iv = window.setInterval(() => void load(), TAPE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const displayQuotes = useMemo(() => {
    const bySymbol = new Map((quotes ?? []).map((q) => [q.symbol, q]));
    return SP_TAPE_SYMBOLS.map(
      (symbol) => bySymbol.get(symbol) ?? { symbol, price: null, changePercent: null },
    );
  }, [quotes]);

  const statusText = unavailable
    ? quotes
      ? "Live prices unavailable. Showing the last prices received."
      : "Live prices unavailable."
    : quotes
      ? ""
      : "Loading live prices.";

  return (
    <div className="ticker-tape">
      {statusText ? (
        <p className={unavailable ? "ticker-tape__fallback" : "sr-only"} role="status">
          {statusText}
        </p>
      ) : null}
      <ul className="ticker-tape__list" aria-label="Large-cap S&P prices">
        {displayQuotes.map((quote) => (
          <li key={quote.symbol}>
            <TapeItem quote={quote} />
          </li>
        ))}
      </ul>
      <div className="ticker-tape__viewport" aria-hidden="true">
        <div className="ticker-tape__track">
          <div className="ticker-tape__group">
            {displayQuotes.map((quote) => (
              <TapeItem key={quote.symbol} quote={quote} />
            ))}
          </div>
          <div className="ticker-tape__group">
            {displayQuotes.map((quote) => (
              <TapeItem key={quote.symbol} quote={quote} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
