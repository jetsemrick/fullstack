import { useEffect, useState } from "react";
import type { MarketIndexQuote } from "@stock/shared";
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

function TapeItem({ quote }: { quote: MarketIndexQuote }) {
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Full-width scrolling S&P ticker tape rendered above the app header.
 *
 * Accessibility: the tape is supplementary, non-interactive ambient motion. The first
 * item group is a labelled region carrying the real values; the duplicated group used to
 * make the marquee loop seamlessly is `aria-hidden`. There are no focusable controls.
 * Under `prefers-reduced-motion` the animation is disabled (see app.css) and the viewport
 * becomes horizontally scrollable so every value stays reachable.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<MarketIndexQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load(signal: AbortSignal) {
      const res = await fetchTickerTape(signal);
      if (cancelled || signal.aborted) return;
      if (res.ok && res.data.quotes.length > 0) {
        setQuotes(res.data.quotes);
        setFailed(false);
      } else {
        setFailed(true);
      }
    }
    const controller = new AbortController();
    void load(controller.signal);
    const iv = window.setInterval(() => {
      void load(controller.signal);
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(iv);
    };
  }, []);

  if (quotes === null) {
    return (
      <div className="ticker-tape ticker-tape--message" role="status">
        {failed ? "Live prices unavailable" : "Loading live prices…"}
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices">
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track">
          <div className="ticker-tape__group" role="list">
            {quotes.map((q) => (
              <span key={q.symbol} role="listitem">
                <TapeItem quote={q} />
              </span>
            ))}
          </div>
          <div className="ticker-tape__group" aria-hidden="true">
            {quotes.map((q) => (
              <TapeItem key={`dup-${q.symbol}`} quote={q} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
