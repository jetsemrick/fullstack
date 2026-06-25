import { useEffect, useState } from "react";
import type { TickerTapeResponse, TickerQuote } from "@stock/shared";
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

function TickerItem({ quote }: { quote: TickerQuote }) {
  const pct = quote.changePercent;
  const pctClass =
    pct === null || !Number.isFinite(pct)
      ? "ticker-tape__pct ticker-tape__pct--muted"
      : pct > 0
        ? "ticker-tape__pct ticker-tape__pct--down"
        : pct < 0
          ? "ticker-tape__pct ticker-tape__pct--up"
          : "ticker-tape__pct ticker-tape__pct--muted";

  return (
    <span className="ticker-tape__item">
      <span className="ticker-tape__symbol">{quote.symbol}</span>
      <span className="ticker-tape__price">{formatPrice(quote.price)}</span>
      <span className={pctClass}>{formatPct(pct)}</span>
    </span>
  );
}

function SkeletonItem() {
  return (
    <span className="ticker-tape__item ticker-tape__item--skeleton">
      <span className="ticker-tape__skeleton-block" style={{ width: "3rem" }} />
      <span className="ticker-tape__skeleton-block" style={{ width: "4rem" }} />
      <span className="ticker-tape__skeleton-block" style={{ width: "3.5rem" }} />
    </span>
  );
}

export function TickerTape() {
  const [data, setData] = useState<TickerTapeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchTickerTape();
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error.error ?? "Failed to load");
        setLoading(false);
        return;
      }
      setData(res.data);
      setError(null);
      setLoading(false);
    }
    void load();
    const iv = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const quotes = data?.quotes ?? [];
  const hasQuotes = quotes.length > 0;

  if (loading) {
    return (
      <div className="ticker-tape" aria-label="Loading stock prices">
        <div className="ticker-tape__track" aria-hidden="true">
          <div className="ticker-tape__content ticker-tape__content--paused">
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !hasQuotes) {
    return (
      <div className="ticker-tape ticker-tape--error" role="status">
        <span className="ticker-tape__fallback">Prices unavailable</span>
      </div>
    );
  }

  return (
    <div className="ticker-tape" aria-label="S&P 500 stock prices">
      <div className="ticker-tape__track" aria-hidden="true">
        <div className="ticker-tape__content">
          {quotes.map((q) => (
            <TickerItem key={q.symbol} quote={q} />
          ))}
          {quotes.map((q) => (
            <TickerItem key={`${q.symbol}-dup`} quote={q} />
          ))}
        </div>
      </div>
    </div>
  );
}
