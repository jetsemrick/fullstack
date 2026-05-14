import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { fetchSpotQuotes } from "./portfolioFetch";
import { aggregatePortfolioTotals, rowMarketValue, rowUnrealizedPl, type HoldingValuationRow } from "./portfolioMath";
import {
  loadPortfolioFromStorage,
  newHoldingRow,
  persistableHoldings,
  savePortfolioToStorage,
  type StoredHolding,
} from "./portfolioStorage";

function formatMoney(v: number | null, currency: string | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatPl(v: number | null, currency: string | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  const cur = currency ? ` ${currency}` : "";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

type QuoteState = {
  lastPrice: number | null;
  currency: string | null;
  error: string | null;
  loading: boolean;
};

export function PortfolioPanel() {
  const formId = useId();
  const [holdings, setHoldings] = useState<StoredHolding[]>(() => loadPortfolioFromStorage());
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    savePortfolioToStorage(persistableHoldings(holdings));
  }, [holdings]);

  const tickersToFetch = useMemo(() => {
    const ids = persistableHoldings(holdings).map((h) => h.ticker.trim().toUpperCase());
    return [...new Set(ids)];
  }, [holdings]);

  const refreshQuotes = useCallback(async () => {
    if (tickersToFetch.length === 0) {
      setQuotes({});
      return;
    }

    setQuotes((prev) => {
      const next = { ...prev };
      for (const t of tickersToFetch) {
        const cur = next[t] ?? { lastPrice: null, currency: null, error: null, loading: false };
        next[t] = { ...cur, loading: true, error: null };
      }
      return next;
    });

    const results = await fetchSpotQuotes(tickersToFetch, 3);
    setQuotes((prev) => {
      const next = { ...prev };
      for (const r of results) {
        const key = r.ticker.toUpperCase();
        if (r.ok) {
          next[key] = {
            lastPrice: r.lastPrice,
            currency: r.currency,
            error: null,
            loading: false,
          };
        } else {
          next[key] = {
            lastPrice: null,
            currency: prev[key]?.currency ?? null,
            error: r.error,
            loading: false,
          };
        }
      }
      return next;
    });
  }, [tickersToFetch]);

  useEffect(() => {
    void refreshQuotes();
  }, [tickersToFetch.join(","), refreshToken, refreshQuotes]);

  const valuationRows: HoldingValuationRow[] = useMemo(() => {
    return persistableHoldings(holdings).map((h) => {
      const key = h.ticker.trim().toUpperCase();
      const q = quotes[key];
      const lastPrice =
        q?.error && !q.loading ? null : (q?.lastPrice ?? null);
      return {
        ticker: h.ticker.trim().toUpperCase(),
        shares: h.shares,
        averageCostPerShare: h.averageCostPerShare,
        lastPrice,
      };
    });
  }, [holdings, quotes]);

  const totals = useMemo(() => aggregatePortfolioTotals(valuationRows), [valuationRows]);

  const displayCurrency = useMemo(() => {
    for (const h of persistableHoldings(holdings)) {
      const c = quotes[h.ticker.trim().toUpperCase()]?.currency;
      if (c) return c;
    }
    return null;
  }, [holdings, quotes]);

  function updateHolding(id: string, patch: Partial<Pick<StoredHolding, "ticker" | "shares" | "averageCostPerShare">>) {
    setHoldings((list) =>
      list.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (typeof next.ticker === "string") next.ticker = next.ticker.toUpperCase();
        return next;
      }),
    );
  }

  function removeHolding(id: string) {
    setHoldings((list) => list.filter((h) => h.id !== id));
  }

  function addRow() {
    setHoldings((list) => [...list, newHoldingRow()]);
  }

  const anyLoading = persistableHoldings(holdings).some((h) => quotes[h.ticker.trim().toUpperCase()]?.loading);

  return (
    <div className="portfolio-panel card content-card">
      <div className="content-toolbar portfolio-toolbar">
        <div className="portfolio-toolbar__title">
          <h2 className="ticker-display portfolio-title">Portfolio</h2>
          <p className="portfolio-sub">Holdings are stored in this browser only. Prices use the same data as the chart.</p>
        </div>
        <div className="portfolio-actions">
          <button type="button" className="horizon-btn" onClick={addRow}>
            Add holding
          </button>
          <button type="button" className="search-btn portfolio-refresh" onClick={() => setRefreshToken((n) => n + 1)} disabled={anyLoading || tickersToFetch.length === 0}>
            Refresh prices
          </button>
        </div>
      </div>

      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th scope="col">Symbol</th>
              <th scope="col">Shares</th>
              <th scope="col">Avg cost</th>
              <th scope="col">Last</th>
              <th scope="col">Market value</th>
              <th scope="col">Unrealized P&amp;L</th>
              <th scope="col"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 && (
              <tr>
                <td colSpan={7} className="portfolio-empty">
                  No positions yet. Add a holding or import from your notes.
                </td>
              </tr>
            )}
            {holdings.map((row) => {
              const key = row.ticker.trim().toUpperCase();
              const q = quotes[key];
              const currency = q?.currency ?? displayCurrency;
              const err = row.ticker.trim() ? q?.error : null;
              const loadingRow = row.ticker.trim() ? (q?.loading ?? false) : false;
              const lastPx = q?.error && !q.loading ? null : (q?.lastPrice ?? null);
              const mv = rowMarketValue(row.shares, lastPx);
              const pl = rowUnrealizedPl(row.shares, lastPx, row.averageCostPerShare);
              const plClass =
                pl == null ? "" : pl > 0 ? "portfolio-pl--up" : pl < 0 ? "portfolio-pl--down" : "";

              return (
                <tr key={row.id}>
                  <td>
                    <label htmlFor={`${formId}-sym-${row.id}`} className="sr-only">Symbol</label>
                    <input
                      id={`${formId}-sym-${row.id}`}
                      className="portfolio-input portfolio-input--sym"
                      value={row.ticker}
                      onChange={(e) => updateHolding(row.id, { ticker: e.target.value.toUpperCase() })}
                      placeholder="AAPL"
                      maxLength={32}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </td>
                  <td>
                    <label htmlFor={`${formId}-sh-${row.id}`} className="sr-only">Shares</label>
                    <input
                      id={`${formId}-sh-${row.id}`}
                      className="portfolio-input"
                      inputMode="decimal"
                      value={row.shares > 0 ? String(row.shares) : ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          updateHolding(row.id, { shares: 0 });
                          return;
                        }
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        updateHolding(row.id, { shares: Math.max(n, 1e-9) });
                      }}
                    />
                  </td>
                  <td>
                    <label htmlFor={`${formId}-ac-${row.id}`} className="sr-only">Average cost</label>
                    <input
                      id={`${formId}-ac-${row.id}`}
                      className="portfolio-input"
                      inputMode="decimal"
                      value={row.averageCostPerShare == null ? "" : String(row.averageCostPerShare)}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          updateHolding(row.id, { averageCostPerShare: null });
                          return;
                        }
                        const n = parseFloat(raw);
                        updateHolding(row.id, { averageCostPerShare: Number.isFinite(n) && n >= 0 ? n : null });
                      }}
                      placeholder="Optional"
                    />
                  </td>
                  <td className="portfolio-num">
                    {err ? (
                      <span className="portfolio-row-err" title={err}>
                        Error
                      </span>
                    ) : loadingRow && lastPx == null ? (
                      <span className="portfolio-pending">…</span>
                    ) : (
                      <span className="portfolio-last">
                        {formatMoney(lastPx, currency)}
                        {loadingRow ? <span className="portfolio-pending portfolio-pending--inline">…</span> : null}
                      </span>
                    )}
                  </td>
                  <td className="portfolio-num">{err ? "—" : formatMoney(mv, currency)}</td>
                  <td className={`portfolio-num ${plClass}`}>{err ? "—" : formatPl(pl, currency)}</td>
                  <td>
                    <button type="button" className="portfolio-remove" onClick={() => removeHolding(row.id)} aria-label={`Remove ${row.ticker || "row"}`}>
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {persistableHoldings(holdings).length > 0 && (
            <tfoot>
              <tr className="portfolio-totals-row">
                <th scope="row" colSpan={4}>Totals</th>
                <td className="portfolio-num">{formatMoney(totals.totalMarketValue, displayCurrency)}</td>
                <td className="portfolio-num">
                  {totals.totalUnrealizedPl == null
                    ? "—"
                    : (() => {
                        const v = totals.totalUnrealizedPl;
                        const cls = v > 0 ? "portfolio-pl--up" : v < 0 ? "portfolio-pl--down" : "";
                        return <span className={cls}>{formatPl(v, displayCurrency)}</span>;
                      })()}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
