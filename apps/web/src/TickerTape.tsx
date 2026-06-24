import { useEffect, useState } from "react";
import type { TickerTapeQuote } from "@stock/shared";
import { SP_TICKER_SYMBOLS } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_MS = 60_000;

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(2)}%`;
}

function pctClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "ticker-tape__pct ticker-tape__pct--muted";
  if (changePercent > 0) return "ticker-tape__pct ticker-tape__pct--up";
  if (changePercent < 0) return "ticker-tape__pct ticker-tape__pct--down";
  return "ticker-tape__pct ticker-tape__pct--muted";
}

function TapeItem({ quote }: { quote: TickerTapeQuote }) {
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

type TapeState =
  | { status: "loading" }
  | { status: "ready"; quotes: TickerTapeQuote[] }
  | { status: "error" };

/**
 * Decorative scrolling ticker tape of curated large-cap S&P 500 names.
 * The animated track is `aria-hidden` (purely decorative); the live price data
 * is exposed to assistive tech via an off-screen, non-animated list.
 */
export function TickerTape() {
  const [state, setState] = useState<TapeState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTickerTape();
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        setState({ status: "ready", quotes: res.data.quotes });
      } else {
        // Only flip to the error fallback if we have nothing to show yet; keep
        // the last good quotes on screen if a later refresh fails.
        setState((prev) => (prev.status === "ready" ? prev : { status: "error" }));
      }
    }
    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  if (state.status === "error") {
    return (
      <div className="ticker-tape ticker-tape--message" role="status">
        <span className="ticker-tape__message">Prices unavailable</span>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="ticker-tape ticker-tape--loading" aria-busy="true" role="status">
        <div className="ticker-tape__track" aria-hidden>
          {SP_TICKER_SYMBOLS.map((sym) => (
            <span key={sym} className="ticker-tape__item ticker-tape__item--skeleton">
              <span className="ticker-tape__symbol">{sym}</span>
              <span className="ticker-tape__skeleton-bar" />
            </span>
          ))}
        </div>
      </div>
    );
  }

  const { quotes } = state;

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices">
      {/* Animated, duplicated track for a seamless marquee loop. Decorative. */}
      <div className="ticker-tape__viewport" aria-hidden>
        <div className="ticker-tape__track">
          {quotes.map((q) => (
            <TapeItem key={`a-${q.symbol}`} quote={q} />
          ))}
          {quotes.map((q) => (
            <TapeItem key={`b-${q.symbol}`} quote={q} />
          ))}
        </div>
      </div>
      {/* Accessible, non-animated equivalent for screen readers. */}
      <ul className="sr-only">
        {quotes.map((q) => (
          <li key={q.symbol}>
            {q.symbol}: {formatPrice(q.price)}, {formatPct(q.changePercent)}
          </li>
        ))}
      </ul>
    </div>
  );
}
