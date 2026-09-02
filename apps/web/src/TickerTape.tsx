import { useEffect, useRef, useState } from "react";
import { SP500_TAPE_SYMBOLS, type TickerTapeQuote } from "@stock/shared";
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

function TapeItems({ quotes, suffix }: { quotes: TickerTapeQuote[]; suffix: string }) {
  return (
    <>
      {quotes.map((q) => (
        <span key={`${suffix}-${q.symbol}`} className="ticker-tape__item">
          <span className="ticker-tape__symbol">{q.symbol}</span>
          <span className="ticker-tape__price">{formatPrice(q.price)}</span>
          <span className={pctClass(q.changePercent)}>{formatPct(q.changePercent)}</span>
        </span>
      ))}
    </>
  );
}

/**
 * Ambient S&P large-cap marquee above the header. Distinct from MarketStrip (indexes + session).
 * Accessibility: the scrolling track is decorative (`aria-hidden`) so duplicated items are not a
 * keyboard or SR trap. A visually hidden live region reports load/error. Quotes are not focusable
 * links because the tape is ambient chrome, not navigation.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const lastGoodRef = useRef<TickerTapeQuote[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTickerTape();
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        lastGoodRef.current = res.data.quotes;
        setQuotes(res.data.quotes);
        setFailed(false);
        return;
      }
      if (!lastGoodRef.current) {
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

  const statusText =
    failed && !quotes
      ? "Live quotes unavailable"
      : !quotes
        ? "Loading S&P ticker quotes"
        : `S&P ticker quotes for ${quotes.length} names`;

  const displayQuotes: TickerTapeQuote[] =
    quotes ??
    SP500_TAPE_SYMBOLS.map((symbol) => ({
      symbol,
      shortName: symbol,
      price: null,
      changePercent: null,
    }));

  return (
    <div className="ticker-tape">
      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track" aria-hidden="true">
          <div className="ticker-tape__group">
            {failed && !quotes ? (
              <span className="ticker-tape__item ticker-tape__item--status">Live quotes unavailable</span>
            ) : null}
            <TapeItems quotes={displayQuotes} suffix="a" />
          </div>
          <div className="ticker-tape__group ticker-tape__group--clone">
            {failed && !quotes ? (
              <span className="ticker-tape__item ticker-tape__item--status">Live quotes unavailable</span>
            ) : null}
            <TapeItems quotes={displayQuotes} suffix="b" />
          </div>
        </div>
      </div>
    </div>
  );
}
