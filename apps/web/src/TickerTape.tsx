import { useEffect, useMemo, useState } from "react";
import { TICKER_TAPE_SYMBOLS, type TickerTapeQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_INTERVAL_MS = 60_000;

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return `$${price.toFixed(2)}`;
}

function formatChange(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  return `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
}

function changeClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__change ticker-tape__change--muted";
  }
  return changePercent > 0
    ? "ticker-tape__change ticker-tape__change--up"
    : "ticker-tape__change ticker-tape__change--down";
}

export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetchTickerTape();
        if (cancelled) return;
        if (response.ok) {
          setQuotes(response.data.quotes);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const intervalId = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const quotesBySymbol = useMemo(
    () => new Map(quotes.map((quote) => [quote.symbol, quote] as const)),
    [quotes],
  );
  const status = loading
    ? "Loading prices"
    : failed
      ? quotes.length > 0
        ? "Prices delayed"
        : "Prices unavailable"
      : "Live prices";

  function renderItems(duplicate: boolean) {
    return (
      <div
        className={`ticker-tape__copy${duplicate ? " ticker-tape__copy--duplicate" : ""}`}
        role={duplicate ? undefined : "list"}
        aria-hidden={duplicate || undefined}
      >
        {TICKER_TAPE_SYMBOLS.map((symbol) => {
          const quote = quotesBySymbol.get(symbol);
          const price = formatPrice(quote?.price ?? null);
          const change = formatChange(quote?.changePercent ?? null);
          return (
            <span
              className="ticker-tape__item"
              role={duplicate ? undefined : "listitem"}
              key={symbol}
              aria-label={`${symbol}, ${price === "—" ? "price unavailable" : price}, change ${change}`}
            >
              <strong className="ticker-tape__symbol">{symbol}</strong>
              <span className="ticker-tape__price">{price}</span>
              <span className={changeClass(quote?.changePercent ?? null)}>{change}</span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <section
      className={`ticker-tape${paused ? " ticker-tape--paused" : ""}`}
      aria-label="S&P 500 large-cap ticker tape"
    >
      <div className="ticker-tape__heading">
        <strong>S&amp;P leaders</strong>
        <span role="status">{status}</span>
        <button
          type="button"
          className="ticker-tape__motion-toggle"
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      <div className="ticker-tape__viewport">
        {/* Only the semantic first copy is announced; the visible control lets users stop the moving content. */}
        <div className="ticker-tape__track">
          {renderItems(false)}
          {renderItems(true)}
        </div>
      </div>
    </section>
  );
}
