import { useEffect, useState } from "react";
import type { StockQuote } from "@stock/shared";
import { fetchTickerTape } from "./api";

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
  if (changePercent === null || !Number.isFinite(changePercent)) return "sp-ticker-tape__pct sp-ticker-tape__pct--muted";
  if (changePercent > 0) return "sp-ticker-tape__pct sp-ticker-tape__pct--up";
  if (changePercent < 0) return "sp-ticker-tape__pct sp-ticker-tape__pct--down";
  return "sp-ticker-tape__pct sp-ticker-tape__pct--muted";
}

export function SPTickerTape() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let res: Awaited<ReturnType<typeof fetchTickerTape>>;
      try {
        res = await fetchTickerTape();
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;
      if (res.ok && res.data.quotes.length > 0) {
        setQuotes(res.data.quotes);
        setStatus("ready");
        return;
      }
      setStatus("error");
    }
    void load();
    const iv = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const visibleQuotes = quotes.length > 0 ? quotes : null;

  return (
    // Ambient quote text is readable but not focusable; the duplicated loop copy is hidden below.
    <section className="sp-ticker-tape" aria-label="S&P large-cap quote tape" aria-live="off">
      <div className="sp-ticker-tape__viewport">
        {visibleQuotes ? (
          <div className="sp-ticker-tape__track">
            {[...visibleQuotes, ...visibleQuotes].map((quote, idx) => (
              <span
                className={`sp-ticker-tape__item ${idx >= visibleQuotes.length ? "sp-ticker-tape__item--duplicate" : ""}`}
                key={`${quote.symbol}-${idx}`}
                aria-hidden={idx >= visibleQuotes.length}
              >
                <span className="sp-ticker-tape__symbol">{quote.symbol}</span>
                <span className="sp-ticker-tape__price">{formatPrice(quote.price)}</span>
                <span className={pctClass(quote.changePercent)}>{formatPct(quote.changePercent)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="sp-ticker-tape__fallback" role={status === "loading" ? "status" : "note"}>
            {status === "loading" ? "Loading S&P quotes..." : "S&P quote tape temporarily unavailable"}
          </span>
        )}
      </div>
    </section>
  );
}
