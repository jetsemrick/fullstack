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
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__pct ticker-tape__pct--muted";
  }
  return changePercent > 0 ? "ticker-tape__pct ticker-tape__pct--up" : "ticker-tape__pct ticker-tape__pct--down";
}

function TickerItem({ quote }: { quote: TickerQuote }) {
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Full-width scrolling ticker tape of curated large-cap S&P names.
 *
 * Accessibility: the tape is ambient/decorative motion. The first copy of the
 * list is exposed to assistive tech via a labelled region; the duplicated copy
 * (needed for a seamless CSS loop) is `aria-hidden`. Motion is disabled under
 * `prefers-reduced-motion` in CSS, degrading to a static clipped strip.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      const res = await fetchTickerTape(controller.signal);
      if (cancelled) return;
      if (res.ok) {
        setQuotes(res.data.quotes);
        setFailed(false);
      } else {
        setFailed(true);
      }
    }

    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(iv);
    };
  }, []);

  if (!quotes || quotes.length === 0) {
    return (
      <div className="ticker-tape ticker-tape--status" aria-label="Live S&P 500 stock prices">
        <span className="ticker-tape__status" role="status">
          {failed ? "Live prices unavailable" : "Loading market data…"}
        </span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices">
      <div className="ticker-tape__track">
        <div className="ticker-tape__group">
          {quotes.map((q) => (
            <TickerItem key={q.symbol} quote={q} />
          ))}
        </div>
        <div className="ticker-tape__group" aria-hidden="true">
          {quotes.map((q) => (
            <TickerItem key={`dup-${q.symbol}`} quote={q} />
          ))}
        </div>
      </div>
    </div>
  );
}
