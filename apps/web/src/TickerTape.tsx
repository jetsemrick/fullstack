import { useEffect, useState } from "react";
import { TICKER_TAPE_SYMBOLS, type TickerTapeQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

const REFRESH_MS = 60_000;

/**
 * Accessibility: the moving row is decorative and not focusable. A looping marquee
 * cannot be a sensible tab stop, and the duplicated copy would be announced twice.
 * The same quotes are exposed once in a visually hidden list. `prefers-reduced-motion`
 * stops the animation and shows a single wrapping row.
 */

type TapeRow = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
};

function rowsFromQuotes(quotes: TickerTapeQuote[] | null): TapeRow[] {
  const bySymbol = new Map((quotes ?? []).map((quote) => [quote.symbol, quote]));
  return TICKER_TAPE_SYMBOLS.map((symbol) => {
    const quote = bySymbol.get(symbol);
    return {
      symbol,
      price: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
    };
  });
}

function formatTapePrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTapePercent(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(2)}%`;
}

function changeClass(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent) || changePercent === 0) {
    return "ticker-tape__change ticker-tape__change--muted";
  }
  return changePercent > 0
    ? "ticker-tape__change ticker-tape__change--up"
    : "ticker-tape__change ticker-tape__change--down";
}

function TapeSequence({ rows }: { rows: TapeRow[] }) {
  return (
    <div className="ticker-tape__seq">
      {rows.map((row) => (
        <span key={row.symbol} className="ticker-tape__item">
          <span className="ticker-tape__symbol">{row.symbol}</span>
          <span className="ticker-tape__price">{formatTapePrice(row.price)}</span>
          <span className={changeClass(row.changePercent)}>{formatTapePercent(row.changePercent)}</span>
        </span>
      ))}
    </div>
  );
}

export function TickerTape() {
  const [quotes, setQuotes] = useState<TickerTapeQuote[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let res: Awaited<ReturnType<typeof fetchTickerTape>>;
      try {
        res = await fetchTickerTape();
      } catch {
        if (!cancelled) setUnavailable(true);
        return;
      }
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        setQuotes(res.data.quotes);
        setUnavailable(false);
        return;
      }
      setUnavailable(true);
    }
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const rows = rowsFromQuotes(quotes);
  const busy = quotes === null && !unavailable;

  return (
    <section className="ticker-tape" aria-label="S&P 500 ticker tape" aria-busy={busy}>
      {unavailable ? (
        <p className="ticker-tape__fallback" role="status">
          {quotes ? "Couldn't refresh quotes" : "Live quotes unavailable"}
        </p>
      ) : null}
      <div className="ticker-tape__viewport" aria-hidden="true">
        <div className="ticker-tape__track">
          <TapeSequence rows={rows} />
          <TapeSequence rows={rows} />
        </div>
      </div>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.symbol}>
            {row.symbol} {formatTapePrice(row.price)} {formatTapePercent(row.changePercent)}
          </li>
        ))}
      </ul>
    </section>
  );
}
