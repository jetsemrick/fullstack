import { useEffect, useState } from "react";
import type { TickerTapeQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_MS = 60_000;

function formatPrice(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pctClass(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "ticker-tape__pct ticker-tape__pct--muted";
  if (v > 0) return "ticker-tape__pct ticker-tape__pct--up";
  if (v < 0) return "ticker-tape__pct ticker-tape__pct--down";
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

export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTickerTape();
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        setQuotes(res.data.quotes);
        setErrored(false);
      } else {
        // Keep any previously loaded quotes so a transient failure does not blank the tape.
        setErrored(true);
      }
    }
    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  // Error with no usable data: non-blocking muted fallback, chart below stays intact.
  if (errored && !quotes) {
    return (
      <div className="ticker-tape ticker-tape--static" aria-label="Live S&P 500 stock prices">
        <span className="ticker-tape__fallback" role="status">
          Prices unavailable
        </span>
      </div>
    );
  }

  // Initial load: muted skeleton placeholders.
  if (!quotes) {
    return (
      <div className="ticker-tape ticker-tape--static" aria-label="Live S&P 500 stock prices" aria-busy="true">
        <div className="ticker-tape__skeleton-row" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="ticker-tape__skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices">
      {/* The scrolling track is decorative; symbols/prices are duplicated for a seamless loop. */}
      <div className="ticker-tape__track" aria-hidden="true">
        {quotes.map((q, i) => (
          <TapeItem key={`a-${q.symbol}-${i}`} quote={q} />
        ))}
        {quotes.map((q, i) => (
          <TapeItem key={`b-${q.symbol}-${i}`} quote={q} />
        ))}
      </div>
    </div>
  );
}
