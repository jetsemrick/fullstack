import { useEffect, useState } from "react";
import type { MarketIndexQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

/** Match `MarketStrip` cadence so the tape and strip refresh in lockstep. */
const REFRESH_MS = 60_000;

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function pctClass(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "ticker-tape__pct ticker-tape__pct--muted";
  if (pct > 0) return "ticker-tape__pct ticker-tape__pct--up";
  if (pct < 0) return "ticker-tape__pct ticker-tape__pct--down";
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
 * Full-width scrolling marquee of curated large-cap S&P names shown above the header.
 *
 * Accessibility: the tape is supplementary, non-interactive market motion. The first
 * item group is a labelled region readable by assistive tech; the duplicated group
 * (used only to make the loop seamless) is `aria-hidden`. There are no focusable
 * controls, and the animation is disabled under `prefers-reduced-motion`, where the
 * viewport becomes horizontally scrollable so all values stay reachable without motion.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<MarketIndexQuote[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controllers = new Set<AbortController>();

    async function load() {
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const res = await fetchTickerTape(controller.signal);
        if (cancelled) return;
        if (res.ok && res.data.quotes.length > 0) {
          setQuotes(res.data.quotes);
          setErrored(false);
        } else {
          setErrored(true);
        }
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        controllers.delete(controller);
      }
    }

    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      controllers.forEach((c) => c.abort());
    };
  }, []);

  if (!quotes) {
    return (
      <div className="ticker-tape ticker-tape--message" role="status">
        {errored ? "Live prices unavailable" : "Loading live prices…"}
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="Large-cap S&P 500 live prices">
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track">
          <div className="ticker-tape__group">
            {quotes.map((q) => (
              <TapeItem key={q.symbol} quote={q} />
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
