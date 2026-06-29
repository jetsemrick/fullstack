import { useCallback, useEffect, useId, useRef, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  buildComparisonRows,
  createCompareTickerList,
  getCompareLineColor,
  MAX_COMPARE_TICKERS,
  normalizeTickerInput,
  summarizeComparisonResults,
  type TickerFetchResult,
} from "./priceChartData";
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

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" },
];

function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const loadGenerationRef = useRef(0);

  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState("");
  const [compareNotice, setCompareNotice] = useState<string | null>(null);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [successfulData, setSuccessfulData] = useState<GetPricesResponse[]>([]);
  const [failures, setFailures] = useState<{ ticker: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const primaryTicker = tickers[0] ?? DEFAULT_TICKER;

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setFatalError(null);
    const horizon = HORIZONS[horizonIndex];
    const settled = await Promise.all(
      tickers.map(async (ticker): Promise<TickerFetchResult> => {
        const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
        if (!res.ok) {
          return { ticker, ok: false, error: res.error.error ?? "Request failed" };
        }
        return { ticker, ok: true, data: res.data };
      }),
    );
    if (generation !== loadGenerationRef.current) return;
    const summary = summarizeComparisonResults(settled);
    setLoading(false);
    setSuccessfulData(summary.successful);
    setFailures(summary.failures);
    if (summary.successful.length === 0) {
      setFatalError(
        summary.failures.length === 1
          ? summary.failures[0]!.error
          : "Could not load data for any selected ticker",
      );
    }
  }, [tickers, horizonIndex]);

  useEffect(() => {
    void load();
  }, [load]);

  const slicedData = useMemo(() => {
    const horizonDays = HORIZONS[horizonIndex].days;
    const byTicker = new Map(
      successfulData.map((d) => [d.ticker, filterSeriesByHorizon(d, horizonDays)]),
    );
    return tickers
      .map((t) => byTicker.get(t))
      .filter((d): d is GetPricesResponse => d != null);
  }, [successfulData, horizonIndex, tickers]);

  const primaryData = useMemo(
    () => slicedData.find((d) => d.ticker === primaryTicker) ?? null,
    [slicedData, primaryTicker],
  );

  const chartSeries = useMemo(
    () =>
      slicedData.map((d) => ({
        ticker: d.ticker,
        color: getCompareLineColor(tickers.indexOf(d.ticker)),
        dataKey: d.ticker,
      })),
    [slicedData, tickers],
  );

  const chartRows = useMemo(() => {
    const seriesByTicker: Record<string, { timestamp: number; close: number }[]> = {};
    for (const d of slicedData) {
      seriesByTicker[d.ticker] = d.series.map((p) => ({ timestamp: p.timestamp, close: p.close }));
    }
    return buildComparisonRows(seriesByTicker);
  }, [slicedData]);

  const failureByTicker = useMemo(
    () => new Map(failures.map((f) => [f.ticker, f.error])),
    [failures],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = normalizeTickerInput(inputTicker) || DEFAULT_TICKER;
    setTickers((prev) => {
      const rest = prev.slice(1).filter((x) => x !== t);
      return [t, ...rest];
    });
    setInputTicker(t);
    setCompareNotice(null);
  }

  function onAddCompare(e: FormEvent) {
    e.preventDefault();
    const result = createCompareTickerList(tickers, compareInput);
    if (!result.ok) {
      setCompareNotice(result.error);
      return;
    }
    setTickers(result.tickers);
    setCompareInput("");
    setCompareNotice(null);
  }

  function removeTicker(ticker: string) {
    if (tickers.length <= 1) return;
    if (ticker === tickers[0]) {
      setInputTicker(tickers[1] ?? DEFAULT_TICKER);
    }
    setTickers((prev) => prev.filter((t) => t !== ticker));
    setCompareNotice(null);
  }

  const canExport = primaryData != null && primaryData.series.length > 0;
  const hasChartData = slicedData.length > 0 && chartRows.length > 0;

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <div className="header-search-group">
          <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
            <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
              Primary ticker
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
              <button
                id={`${formId}-submit`}
                type="submit"
                className="search-btn"
                disabled={loading}
              >
                Search
              </button>
            </div>
          </form>
          <form className="compare-form" onSubmit={onAddCompare} aria-labelledby={`${compareFormId}-legend`}>
            <label id={`${compareFormId}-legend`} htmlFor={`${compareFormId}-compare`} className="sr-only">
              Add compare ticker
            </label>
            <div className="search-input-wrapper compare-input-wrapper">
              <input
                id={`${compareFormId}-compare`}
                name="compare"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={compareInput}
                onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                className="search-input compare-input"
                placeholder="Add compare ticker"
                maxLength={32}
                disabled={tickers.length >= MAX_COMPARE_TICKERS}
              />
              <button
                type="submit"
                className="search-btn compare-btn"
                disabled={loading || tickers.length >= MAX_COMPARE_TICKERS}
              >
                Compare
              </button>
            </div>
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

        {!loading && fatalError && (
          <>
            <div className="card error-banner" role="alert">
              <strong>Could not load data.</strong> {fatalError}
            </div>
            {tickers.length > 1 && (
              <div className="card content-card">
                <div className="content-toolbar">
                  <div className="ticker-chips" role="list" aria-label="Compared tickers">
                    {tickers.map((t, i) => (
                      <div key={t} className="ticker-chip ticker-chip--failed" role="listitem">
                        <span className="ticker-chip__dot" style={{ background: getCompareLineColor(i) }} aria-hidden />
                        <span className="ticker-chip__symbol">{t}</span>
                        <span className="ticker-chip__error">Failed</span>
                        <button
                          type="button"
                          className="ticker-chip__remove"
                          onClick={() => removeTicker(t)}
                          aria-label={`Remove ${t}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !fatalError && hasChartData && (
          <>
            {!loading && failures.length > 0 && (
              <div className="card warning-banner" role="status">
                <strong>Some tickers failed to load.</strong>{" "}
                {failures.map((f) => `${f.ticker}: ${f.error}`).join("; ")}
              </div>
            )}

            <div className="card content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="ticker-chips" role="list" aria-label="Compared tickers">
                    {tickers.map((t, i) => {
                      const data = slicedData.find((d) => d.ticker === t);
                      const failure = failureByTicker.get(t);
                      const color = getCompareLineColor(i);
                      const pct = data ? formatPercentChange(data) : null;
                      return (
                        <div
                          key={t}
                          className={`ticker-chip ${failure ? "ticker-chip--failed" : ""}`}
                          role="listitem"
                        >
                          <span className="ticker-chip__dot" style={{ background: color }} aria-hidden />
                          <span className="ticker-chip__symbol">{t}</span>
                          {data && (
                            <>
                              <span className="ticker-chip__price">
                                {formatLast(data.lastPrice, data.currency)}
                              </span>
                              {pct && (
                                <span
                                  className={`ticker-chip__pct ${pct.isPositive ? "positive" : pct.isNegative ? "negative" : "muted"}`}
                                >
                                  {pct.text}
                                </span>
                              )}
                            </>
                          )}
                          {failure && !data && (
                            <span className="ticker-chip__error" title={failure}>
                              Failed
                            </span>
                          )}
                          {tickers.length > 1 && (
                            <button
                              type="button"
                              className="ticker-chip__remove"
                              onClick={() => removeTicker(t)}
                              aria-label={`Remove ${t}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {compareNotice && (
                    <p className="compare-notice" role="status">
                      {compareNotice}
                    </p>
                  )}
                  <div className="horizon-buttons">
                    {HORIZONS.map((h, i) => (
                      <button
                        key={h.label}
                        className={`horizon-btn ${i === horizonIndex ? "active" : ""}`}
                        onClick={() => setHorizonIndex(i)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-container" aria-label="Price chart">
                <PriceChart
                  rows={chartRows}
                  series={chartSeries}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </div>
            <div className="actions-footer">
              <button
                type="button"
                className="btn-export"
                onClick={() => primaryData && downloadPricesCsv(primaryData)}
                disabled={!canExport}
                title={
                  canExport
                    ? `Export ${primaryTicker} CSV`
                    : `Export unavailable until ${primaryTicker} loads successfully`
                }
              >
                Export CSV
              </button>
              {tickers.length > 1 && (
                <span className="export-hint muted">Exports primary ticker ({primaryTicker}) only</span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
