import { useEffect, useMemo, useState } from "react";
import type { MarketContextResponse } from "@stock/shared";
import { fetchMarketContext } from "./api";

const NY_ZONE = "America/New_York";

function formatMarketUiState(raw: string | null): string {
  if (!raw) return "Unknown";
  switch (raw) {
    case "REGULAR":
      return "Market open";
    case "CLOSED":
      return "Market closed";
    case "PRE":
    case "PRE_MARKET":
      return "Pre-market";
    case "POST":
    case "POSTPOST":
    case "POST_MARKET":
      return "After hours";
    case "CLOSING_ROTATION_PERIOD":
      return "Closing auction";
    default:
      return raw.replace(/_/g, " ");
  }
}

function indexBriefLabel(symbol: string, shortName: string): string {
  switch (symbol) {
    case "^GSPC":
      return "S&P 500";
    case "^DJI":
      return "Dow";
    case "^IXIC":
      return "Nasdaq";
    default:
      return shortName;
  }
}

function formatPct(changePercent: number | null): string {
  if (changePercent === null || !Number.isFinite(changePercent)) return "—";
  const sign = changePercent > 0 ? "+" : "";
  return `${sign}${changePercent.toFixed(2)}%`;
}

export function MarketStrip() {
  const [nycAnchor, setNycAnchor] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNycAnchor(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [ctx, setCtx] = useState<MarketContextResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetchMarketContext();
      if (!cancelled && res.ok) setCtx(res.data);
    }
    void load();
    const iv = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  const nyTimeFormatted = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: NY_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(new Date(nycAnchor));
  }, [nycAnchor]);

  const statusClass = useMemo(() => {
    const s = ctx?.marketState?.toUpperCase() ?? "";
    if (s === "REGULAR") return "market-status market-status--open";
    if (s === "CLOSED") return "market-status market-status--closed";
    return "market-status market-status--other";
  }, [ctx?.marketState]);

  return (
    <div className="market-strip" aria-label="US market session and benchmark indexes">
      <div className="market-strip__row">
        <span className={statusClass}>{ctx ? formatMarketUiState(ctx.marketState) : "Loading…"}</span>
        <span className="market-strip__dot" aria-hidden>
          ·
        </span>
        <time
          className="market-strip__clock"
          title="Time in New York (United States eastern time)"
          dateTime={new Date(nycAnchor).toISOString()}
        >
          NYC {nyTimeFormatted}
        </time>
      </div>
      <div className="market-strip__indexes" role="list">
        {(ctx?.indexes ?? []).map((q) => {
          const pct = q.changePercent;
          const pctClass =
            pct === null || !Number.isFinite(pct)
              ? "market-strip__pct market-strip__pct--muted"
              : pct > 0
                ? "market-strip__pct market-strip__pct--up"
                : pct < 0
                  ? "market-strip__pct market-strip__pct--down"
                  : "market-strip__pct market-strip__pct--muted";
          return (
            <span key={q.symbol} role="listitem" className="market-strip__chip">
              <span className="market-strip__chip-name">{indexBriefLabel(q.symbol, q.shortName)}</span>
              <span className={pctClass} aria-label={`${indexBriefLabel(q.symbol, q.shortName)} change`}>
                {formatPct(pct)}
              </span>
            </span>
          );
        })}
        {!ctx?.indexes?.length ? (
          <span className="market-strip__chip market-strip__chip--pending" aria-busy role="status">
            Loading indexes…
          </span>
        ) : null}
      </div>
    </div>
  );
}
