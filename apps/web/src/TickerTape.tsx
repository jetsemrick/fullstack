import { useEffect, useRef, useState } from "react";
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
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__pct ticker-tape__pct--muted";
  }
  return changePercent > 0
    ? "ticker-tape__pct ticker-tape__pct--up"
    : "ticker-tape__pct ticker-tape__pct--down";
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

export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const hasDataRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTickerTape();
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        hasDataRef.current = true;
        setQuotes(res.data.quotes);
        setFailed(false);
      } else if (!hasDataRef.current) {
        // Only show the fallback when we have never loaded quotes; otherwise
        // keep the last good tape on a transient refresh failure.
        setFailed(true);
      }
    }
    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  if (quotes === null && failed) {
    return (
      <div className="ticker-tape ticker-tape--fallback" role="status">
        <span className="ticker-tape__fallback-text">Prices unavailable</span>
      </div>
    );
  }

  if (quotes === null) {
    return (
      <div className="ticker-tape ticker-tape--loading" aria-hidden="true">
        <div className="ticker-tape__track ticker-tape__track--static">
          {SP_TICKER_SYMBOLS.map((symbol) => (
            <span key={symbol} className="ticker-tape__item ticker-tape__item--skeleton">
              <span className="ticker-tape__symbol">{symbol}</span>
              <span className="ticker-tape__price">—</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices">
      {/* Decorative scrolling track: duplicated so the marquee loops seamlessly. */}
      <div className="ticker-tape__track" aria-hidden="true">
        {quotes.map((q) => (
          <TapeItem key={`a-${q.symbol}`} quote={q} />
        ))}
        {quotes.map((q) => (
          <TapeItem key={`b-${q.symbol}`} quote={q} />
        ))}
      </div>
      {/* Non-animated, screen-reader-only list exposing the same data. */}
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
