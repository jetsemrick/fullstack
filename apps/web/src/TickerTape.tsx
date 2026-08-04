import { useEffect, useMemo, useState } from "react";
import { TICKER_TAPE_SYMBOLS, type TickerTapeQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_MS = 60_000;

function formatPrice(price: number | null): string {
  return price === null || !Number.isFinite(price) ? "—" : price.toFixed(2);
}

function formatChange(change: number | null): string {
  if (change === null || !Number.isFinite(change)) return "—";
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function changeClass(change: number | null): string {
  if (change === null || !Number.isFinite(change) || change === 0) return "ticker-tape__change--muted";
  return change > 0 ? "ticker-tape__change--up" : "ticker-tape__change--down";
}

export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let response: Awaited<ReturnType<typeof fetchTickerTape>>;
      try {
        response = await fetchTickerTape();
      } catch {
        if (!cancelled) {
          setLoading(false);
          setUnavailable(true);
        }
        return;
      }
      if (cancelled) return;
      setLoading(false);
      if (response.ok) {
        setQuotes(response.data.quotes);
        setUnavailable(false);
      } else {
        setUnavailable(true);
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const displayedQuotes = useMemo(() => {
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    return TICKER_TAPE_SYMBOLS.map(
      (symbol): TickerTapeQuote => bySymbol.get(symbol) ?? { symbol, price: null, changePercent: null },
    );
  }, [quotes]);

  const status = loading ? "Loading quotes" : unavailable ? "Quotes delayed" : "Live";

  return (
    <section className="ticker-tape" aria-label="Large-cap stock ticker">
      <span className={`ticker-tape__status ${unavailable ? "ticker-tape__status--delayed" : ""}`}>
        {status}
      </span>
      {/* The continuously moving content is decorative; a stable status remains available to assistive technology. */}
      <div className="ticker-tape__viewport" aria-hidden="true">
        <div className="ticker-tape__track">
          {[0, 1].map((copy) => (
            <div className="ticker-tape__group" key={copy}>
              {displayedQuotes.map((quote) => (
                <span className="ticker-tape__item" key={`${copy}-${quote.symbol}`}>
                  <span className="ticker-tape__symbol">{quote.symbol}</span>
                  <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
                  <span className={`ticker-tape__change ${changeClass(quote.changePercent)}`}>
                    {formatChange(quote.changePercent)}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        {unavailable ? "Live stock quotes are temporarily unavailable." : "Large-cap stock quotes loaded."}
      </span>
    </section>
  );
}
