import { useEffect, useRef, useState } from "react";
import type { TickerTapeQuote } from "@stock/shared";
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

function TickerItem({ quote, listItem }: { quote: TickerTapeQuote; listItem?: boolean }) {
  return (
    <span className="ticker-tape__item" role={listItem ? "listitem" : undefined}>
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
    </span>
  );
}

/**
 * Full-width scrolling S&P ticker tape rendered above the header.
 *
 * Accessibility: quote items are ambient market context rather than links. The
 * pause/resume control is keyboard-accessible, one quote copy carries list semantics,
 * and the duplicate used for the seamless loop is `aria-hidden`. The animation also
 * honours `prefers-reduced-motion`, becoming a static horizontal strip.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[]>([]);
  const [errored, setErrored] = useState(false);
  const [paused, setPaused] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();
    async function load() {
      if (inFlight) return;
      inFlight = true;
      const requestId = ++requestIdRef.current;
      try {
        const res = await fetchTickerTape(controller.signal);
        if (cancelled || requestId !== requestIdRef.current) return;
        if (res.ok) {
          setQuotes(res.data.quotes);
          setErrored(false);
        } else {
          setErrored(true);
        }
      } catch {
        if (cancelled || controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        setErrored(true);
      } finally {
        inFlight = false;
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

  if (quotes.length === 0) {
    return (
      <div className="ticker-tape ticker-tape--fallback" aria-label="S&P live ticker" role="status">
        <span className="ticker-tape__fallback-text">
          {errored ? "Live quotes unavailable" : "Loading live quotes…"}
        </span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="S&P live ticker tape">
      {errored ? (
        <div className="ticker-tape__notice" role="status">
          Live quotes delayed
        </div>
      ) : null}
      <div className="ticker-tape__row">
        <div className="ticker-tape__viewport">
          <div className={`ticker-tape__track${paused ? " ticker-tape__track--paused" : ""}`}>
            <div className="ticker-tape__group" role="list" aria-label="S&P large-cap quotes">
              {quotes.map((q) => (
                <TickerItem key={q.symbol} quote={q} listItem />
              ))}
            </div>
            <div className="ticker-tape__group" aria-hidden="true">
              {quotes.map((q) => (
                <TickerItem key={`dup-${q.symbol}`} quote={q} />
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="ticker-tape__control"
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
