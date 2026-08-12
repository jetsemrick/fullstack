import { useEffect, useState } from "react";
import type { TickerQuote } from "@stock/shared";
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

function TapeItem({ quote }: { quote: TickerQuote }) {
  return (
    <li className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
    </li>
  );
}

/**
 * Scrolling S&P ticker tape rendered full-width above the header.
 *
 * Accessibility: the tape is intentionally **decorative** (`aria-hidden`). It provides ambient
 * market motion and is not keyboard-focusable; the primary, screen-reader-friendly market data
 * lives in `MarketStrip` and the main chart. This avoids screen readers announcing the endlessly
 * looping (and duplicated) marquee content. Motion is disabled under `prefers-reduced-motion`.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();
      const res = await fetchTickerTape(controller.signal);
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        setQuotes(res.data.quotes);
        setFailed(false);
      } else if (!res.ok) {
        setFailed(true);
      }
    }

    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(iv);
    };
  }, []);

  if (!quotes) {
    return (
      <div className="ticker-tape ticker-tape--fallback" aria-hidden>
        <span className="ticker-tape__fallback-text">
          {failed ? "Live prices unavailable" : "Loading live prices…"}
        </span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-hidden>
      {failed ? <span className="sr-only">Live prices unavailable</span> : null}
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track">
          {[0, 1].map((groupIndex) => (
            <ul className="ticker-tape__group" key={groupIndex}>
              {quotes.map((q) => (
                <TapeItem key={`${groupIndex}-${q.symbol}`} quote={q} />
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
