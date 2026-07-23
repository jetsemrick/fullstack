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
  if (changePercent === null || !Number.isFinite(changePercent)) return "ticker-tape__pct--muted";
  if (changePercent > 0) return "ticker-tape__pct--up";
  if (changePercent < 0) return "ticker-tape__pct--down";
  return "ticker-tape__pct--muted";
}

function TickerItem({ quote }: { quote: MarketIndexQuote }) {
  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={`ticker-tape__pct ${pctClass(quote.changePercent)}`}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Full-width scrolling marquee of curated large-cap S&P quotes, above the header.
 *
 * Accessibility: the tape is intentionally decorative (`aria-hidden`). It mirrors
 * ambient market motion and duplicates its content for a seamless loop, which
 * would read as noisy, repeated numbers to a screen reader. The header's
 * `MarketStrip` already exposes benchmark data via the accessibility tree, so no
 * information is lost. Motion is disabled under `prefers-reduced-motion` (CSS).
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<MarketIndexQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetchTickerTape(controller.signal);
        if (cancelled) return;
        if (res.ok && res.data.quotes.length > 0) {
          setQuotes(res.data.quotes);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
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

  if (!quotes) {
    return (
      <div className="ticker-tape ticker-tape--fallback" aria-hidden="true">
        <span className="ticker-tape__notice">{failed ? "Live quotes unavailable" : "Loading live quotes…"}</span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-hidden="true">
      {failed ? <span className="ticker-tape__stale-dot" title="Showing last known quotes" /> : null}
      <div className="ticker-tape__track">
        {/* Two identical copies let the track scroll one full width and loop seamlessly. */}
        {quotes.map((q) => (
          <TickerItem key={`a-${q.symbol}`} quote={q} />
        ))}
        {quotes.map((q) => (
          <TickerItem key={`b-${q.symbol}`} quote={q} />
        ))}
      </div>
    </div>
  );
}
