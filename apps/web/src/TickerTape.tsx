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
 * One looping half of the marquee. The symbol list is repeated so a single half is
 * comfortably wider than any realistic viewport — this keeps the wrap gapless (the
 * viewport is always covered) in addition to seamless.
 */
function TapeGroup({ quotes, keyPrefix, hidden }: { quotes: MarketIndexQuote[]; keyPrefix: string; hidden?: boolean }) {
  const REPEAT = 2;
  return (
    <div className="ticker-tape__group" aria-hidden={hidden ? "true" : undefined}>
      {Array.from({ length: REPEAT }).flatMap((_, r) =>
        quotes.map((q) => <TapeItem key={`${keyPrefix}-${r}-${q.symbol}`} quote={q} />),
      )}
    </div>
  );
}

/**
 * Full-width scrolling S&P ticker tape rendered above the app header.
 *
 * Accessibility: the tape is supplementary, non-interactive ambient motion. The whole
 * strip is a labelled group carrying the real values; the duplicated half that exists only
 * to make the marquee loop seamlessly is `aria-hidden`. There are no focusable controls.
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
    <div className="ticker-tape" aria-label="Live S&P 500 stock prices" role="group">
      <div className="ticker-tape__viewport">
        {/* Two structurally identical halves make the track exactly 2x one half wide, so
            translateX(-50%) wraps seamlessly with no layout jump. Each half repeats the
            list so it stays wider than the viewport (no blank gap at the wrap). The second
            half is aria-hidden as it only exists to make the marquee loop. */}
        <div className="ticker-tape__track">
          <TapeGroup quotes={quotes} keyPrefix="a" />
          <TapeGroup quotes={quotes} keyPrefix="b" hidden />
        </div>
      </div>
    </div>
  );
}
