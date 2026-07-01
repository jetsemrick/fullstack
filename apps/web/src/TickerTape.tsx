import { useEffect, useState } from "react";
import { SP_TICKER_SYMBOLS, type StockQuote } from "@stock/shared";
import { fetchBatchQuotes } from "./api";

/** Aligned with `MarketStrip` so both refresh on the same ~60s cadence. */
const REFRESH_MS = 60_000;

function formatPrice(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function pctDirection(v: number | null): "up" | "down" | "muted" {
  if (v == null || !Number.isFinite(v) || v === 0) return "muted";
  return v > 0 ? "up" : "down";
}

function TickerItem({ quote }: { quote: StockQuote }) {
  const dir = pctDirection(quote.changePercent);
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={`ticker-tape__pct ticker-tape__pct--${dir}`}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Scrolling marquee of curated large-cap S&P names, distinct from `MarketStrip`.
 *
 * Accessibility: the tape is treated as decorative, ambient motion. The moving
 * track is duplicated to loop seamlessly and is marked `aria-hidden`, so assistive
 * technology is not disrupted by constantly shifting, doubled content. The
 * authoritative session data remains available in `MarketStrip` and the main chart.
 * Under `prefers-reduced-motion`, the animation is disabled (see `app.css`) and the
 * viewport becomes horizontally scrollable so the same prices stay reachable.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<StockQuote[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetchBatchQuotes({ symbols: SP_TICKER_SYMBOLS, signal: controller.signal });
        if (cancelled) return;
        if (res.ok && res.data.quotes.length > 0) {
          setQuotes(res.data.quotes);
          setErrored(false);
        } else {
          setErrored(true);
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) setErrored(true);
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

  // Non-blocking fallbacks: never obscure the app; keep the strip height stable.
  if (quotes === null) {
    return (
      <div className="ticker-tape ticker-tape--pending" aria-label="Live S&P 500 ticker">
        <span className="ticker-tape__notice" role="status">
          {errored ? "Live prices unavailable" : "Loading live prices…"}
        </span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Live S&P 500 ticker">
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track" aria-hidden="true">
          {[0, 1].map((copy) => (
            <div className="ticker-tape__group" key={copy}>
              {quotes.map((q) => (
                <TickerItem key={`${copy}-${q.symbol}`} quote={q} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
