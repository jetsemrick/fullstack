import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import {
  alignSeriesByTimestamp,
  filterPairBySharedHorizon,
  filterSeriesByHorizon,
} from "./compareSeries";
import { fetchPrices } from "./api";
import { downloadComparisonPricesCsv, downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import "./app.css";

function formatLast(v: number | null, currency: string | null) {
  if (v == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur}`;
}

function formatPercentChange(data: GetPricesResponse | null) {
  if (!data || !data.series || data.series.length < 2) return null;
  const first = data.series[0].close;
  const last = data.series[data.series.length - 1].close;
  if (!first) return null;
  const diff = last - first;
  const pct = (diff / first) * 100;
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    isPositive: pct > 0,
    isNegative: pct < 0,
  };
}

function tailClose(display: GetPricesResponse | null): number | null {
  if (!display?.series?.length) return null;
  return display.series[display.series.length - 1]!.close;
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" },
];

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(HORIZONS.length - 1);

  const [compareTicker, setCompareTicker] = useState<string | null>(null);
  const [compareInput, setCompareInput] = useState<string>("");

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [dataCompare, setDataCompare] = useState<GetPricesResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareWarning, setCompareWarning] = useState<string | null>(null);

  const horizonDays = HORIZONS[horizonIndex].days;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCompareWarning(null);

    const horizon = HORIZONS[horizonIndex];
    const primaryReq = fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });

    if (!compareTicker) {
      const res = await primaryReq;
      setLoading(false);
      setDataCompare(null);
      if (!res.ok) {
        setData(null);
        setError(res.error.error ?? "Request failed");
        return;
      }
      setData(res.data);
      return;
    }

    const normalizedPrimary = ticker.trim().toUpperCase();
    const normalizedCompare = compareTicker.trim().toUpperCase();

    if (normalizedCompare === normalizedPrimary) {
      const res = await primaryReq;
      setLoading(false);
      setDataCompare(null);
      setCompareWarning("Compare ticker must differ from the primary ticker.");
      if (!res.ok) {
        setData(null);
        setError(res.error.error ?? "Request failed");
        return;
      }
      setData(res.data);
      return;
    }

    const compareReq = fetchPrices({
      ticker: normalizedCompare,
      range: horizon.range,
      interval: horizon.interval,
    });

    const [rp, rc] = await Promise.allSettled([primaryReq, compareReq]);

    setLoading(false);

    let primaryData: GetPricesResponse | null = null;
    let secondaryData: GetPricesResponse | null = null;
    let primaryErrMsg: string | null = null;
    let secondaryErrMsg: string | null = null;

    if (rp.status !== "fulfilled") {
      primaryErrMsg = rp.reason instanceof Error ? rp.reason.message : String(rp.reason);
    } else if (!rp.value.ok) {
      primaryErrMsg = rp.value.error.error ?? "Request failed";
    } else {
      primaryData = rp.value.data;
    }

    if (rc.status !== "fulfilled") {
      secondaryErrMsg = rc.reason instanceof Error ? rc.reason.message : String(rc.reason);
    } else if (!rc.value.ok) {
      secondaryErrMsg = rc.value.error.error ?? "Request failed";
    } else {
      secondaryData = rc.value.data;
    }

    if (!primaryData) {
      setData(null);
      setDataCompare(null);
      setError(primaryErrMsg ?? "Request failed");
      return;
    }

    setData(primaryData);

    if (!secondaryData) {
      setDataCompare(null);
      setCompareWarning(`Could not load ${normalizedCompare}${secondaryErrMsg ? `: ${secondaryErrMsg}` : ""}`);
    } else {
      setCompareWarning(null);
      setDataCompare(secondaryData);
    }
  }, [compareTicker, horizonIndex, ticker]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayBundles = useMemo((): {
    primary: GetPricesResponse | null;
    secondary: GetPricesResponse | null;
  } => {
    if (!data) return { primary: null, secondary: null };
    if (dataCompare) {
      const [p, s] = filterPairBySharedHorizon(data, dataCompare, horizonDays);
      return { primary: p, secondary: s };
    }
    return { primary: filterSeriesByHorizon(data, horizonDays), secondary: null };
  }, [data, dataCompare, horizonDays]);

  const primaryDisplay = displayBundles.primary;
  const secondaryDisplay = displayBundles.secondary;

  const alignedExportRows = useMemo(() => {
    if (!primaryDisplay?.series?.length || !secondaryDisplay?.series?.length) return null;
    return alignSeriesByTimestamp(primaryDisplay, secondaryDisplay);
  }, [primaryDisplay, secondaryDisplay]);

  const lastPrimary = tailClose(primaryDisplay) ?? data?.lastPrice ?? null;
  const curPrimary = primaryDisplay?.currency ?? data?.currency ?? null;

  const lastSecondary =
    secondaryDisplay?.series?.length ?
      secondaryDisplay.series[secondaryDisplay.series.length - 1]!.close
    : (dataCompare?.lastPrice ?? null);
  const curSecondary = secondaryDisplay?.currency ?? dataCompare?.currency ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
  }

  function onSubmitCompare(e: FormEvent) {
    e.preventDefault();
    const c = compareInput.trim().toUpperCase();
    if (!c) {
      setCompareTicker(null);
      return;
    }
    setCompareInput(c);
    setCompareTicker(c);
  }

  function clearComparison() {
    setCompareTicker(null);
    setCompareInput("");
    setDataCompare(null);
    setCompareWarning(null);
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-forms">
          <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
            <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
              Ticker
            </label>
            <div className="search-input-wrapper">
              <input
                id={`${formId}-ticker`}
                name="ticker"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={inputTicker}
                onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                className="search-input"
                placeholder={`e.g. ${DEFAULT_TICKER}`}
                maxLength={32}
              />
              <button id={`${formId}-submit`} type="submit" className="search-btn" disabled={loading}>
                Search
              </button>
            </div>
          </form>
          <form
            className="search-form compare-form"
            onSubmit={onSubmitCompare}
            aria-labelledby={`${compareFormId}-legend`}
          >
            <label id={`${compareFormId}-legend`} htmlFor={`${compareFormId}-ticker`} className="sr-only">
              Compare ticker
            </label>
            <div className="search-input-wrapper">
              <input
                id={`${compareFormId}-ticker`}
                name="compare"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                className="search-input search-input--compare"
                placeholder="Compare to..."
                maxLength={32}
                disabled={loading}
              />
              <button type="submit" className="btn-secondary-outline" disabled={loading}>
                Compare
              </button>
            </div>
            {compareTicker != null && (
              <button
                type="button"
                className="btn-text-clear"
                onClick={clearComparison}
                aria-label={`Stop comparing (${compareTicker})`}
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </header>

      <main className="main-content">
        {loading && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!loading && error && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {error}
          </div>
        )}

        {!loading &&
          !error &&
          data &&
          primaryDisplay && (
          <>
            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{data.ticker}</h2>
                    <span className="metric-badge">{formatLast(lastPrimary, curPrimary)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(primaryDisplay);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive ?
                          "positive"
                        : percentChange.isNegative ?
                          "negative"
                        : "muted";
                      return <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>;
                    })()}
                    {dataCompare &&
                      secondaryDisplay &&
                      secondaryDisplay.series.length &&
                      !compareWarning && (
                      <>
                        <span className="metrics-separator" aria-hidden="true">
                          /
                        </span>
                        <h2 className="ticker-display ticker-display--secondary">{dataCompare.ticker}</h2>
                        <span className="metric-badge">{formatLast(lastSecondary, curSecondary)}</span>
                        {(() => {
                          const percentChange = formatPercentChange(secondaryDisplay);
                          if (!percentChange) return null;
                          const statusClass = percentChange.isPositive ?
                              "positive"
                            : percentChange.isNegative ?
                              "negative"
                            : "muted";
                          return <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>;
                        })()}
                      </>
                    )}
                  </div>
                  <div className="horizon-buttons">
                    {HORIZONS.map((h, i) => (
                      <button
                        key={h.label}
                        type="button"
                        className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                        onClick={() => setHorizonIndex(i)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {compareWarning && (
                <div className="compare-note" role="status">
                  {compareWarning}
                </div>
              )}
              <div className="chart-container" aria-label="Price chart">
                <PriceChart
                  primary={primaryDisplay}
                  secondary={secondaryDisplay ?? undefined}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => {
                  if (alignedExportRows && dataCompare && !compareWarning) {
                    downloadComparisonPricesCsv({
                      rows: alignedExportRows,
                      primaryTicker: primaryDisplay.ticker,
                      secondaryTicker: dataCompare.ticker,
                      primaryCurrency: primaryDisplay.currency ?? data.currency ?? null,
                      secondaryCurrency: secondaryDisplay?.currency ?? dataCompare.currency ?? null,
                    });
                    return;
                  }
                  downloadPricesCsv(primaryDisplay);
                }}
                title="Export CSV"
              >
                Export CSV
              </button>
            </div>
          </>
          )}
      </main>
    </div>
  );
}
