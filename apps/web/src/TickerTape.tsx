import { useEffect, useMemo, useState } from "react";
import type { MarketIndexQuote } from "@stock/shared";
import { fetchTapeQuotes } from "./api";

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
 * Ambient S&P large-cap marquee. Marked decorative (`aria-hidden`) because prices
 * duplicate no actionable control and motion is non-essential; screen readers
 * still get market context from `MarketStrip` below.
 */
export function TickerTape() {
  const [quotes, setQuotes] = useState<MarketIndexQuote[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTapeQuotes();
      if (cancelled) return;
      if (res.ok) {
        setQuotes(res.data.quotes);
        setFailed(false);
        return;
      }
      setFailed(true);
    }
    void load();
    const iv = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const displayQuotes = useMemo(() => {
    if (quotes && quotes.length > 0) return quotes;
    return null;
  }, [quotes]);

  const trackContent = displayQuotes ? (
    <>
      {displayQuotes.map((q) => (
        <TapeItem key={`a-${q.symbol}`} quote={q} />
      ))}
      {displayQuotes.map((q) => (
        <TapeItem key={`b-${q.symbol}`} quote={q} />
      ))}
    </>
  ) : (
    <span className="ticker-tape__item ticker-tape__item--pending">
      {failed ? "Tape quotes unavailable" : "Loading tape…"}
    </span>
  );

  return (
    <div className="ticker-tape" aria-hidden="true">
      <div className="ticker-tape__viewport">
        <div className="ticker-tape__track">{trackContent}</div>
      </div>
    </div>
  );
}
