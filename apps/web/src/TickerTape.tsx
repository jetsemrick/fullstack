import { useEffect, useMemo, useState } from "react";
import { TICKER_TAPE_SYMBOLS, type MarketQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_INTERVAL_MS = 60_000;

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  return `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
}

function quoteClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__change ticker-tape__change--muted";
  }
  return changePercent > 0
    ? "ticker-tape__change ticker-tape__change--up"
    : "ticker-tape__change ticker-tape__change--down";
}

function TapeItems({ quotes, duplicate = false }: { quotes: MarketQuote[]; duplicate?: boolean }) {
  return (
    <div
      className="ticker-tape__group"
      role={duplicate ? undefined : "list"}
      aria-hidden={duplicate || undefined}
    >
      {quotes.map((quote) => (
        <span className="ticker-tape__item" role={duplicate ? undefined : "listitem"} key={quote.symbol}>
          <span className="ticker-tape__symbol">{quote.symbol}</span>
          <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
          <span className={quoteClass(quote.changePercent)}>{formatChange(quote.changePercent)}</span>
        </span>
      ))}
    </div>
  );
}

export function TickerTape() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchTickerTape();
        if (cancelled) return;
        if (result.ok) {
          setQuotes(result.data.quotes);
          setHasError(false);
        } else {
          setHasError(true);
        }
      } catch {
        if (!cancelled) setHasError(true);
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const displayedQuotes = useMemo(() => {
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    return TICKER_TAPE_SYMBOLS.map(
      (symbol) =>
        bySymbol.get(symbol) ?? {
          symbol,
          shortName: symbol,
          price: null,
          changePercent: null,
        },
    );
  }, [quotes]);

  const status = hasError
    ? quotes.length > 0
      ? "Quotes delayed"
      : "Quotes temporarily unavailable"
    : quotes.length === 0
      ? "Loading quotes"
      : null;

  return (
    <section className="ticker-tape" aria-labelledby="ticker-tape-title">
      <h2 id="ticker-tape-title" className="sr-only">
        Live S&amp;P 500 stock quotes
      </h2>
      {status ? (
        <span className="ticker-tape__status" role="status">
          {status}
        </span>
      ) : null}
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track">
          {/* One semantic list is exposed; the duplicate only provides a seamless visual loop. */}
          <TapeItems quotes={displayedQuotes} />
          <TapeItems quotes={displayedQuotes} duplicate />
        </div>
      </div>
    </section>
  );
}
