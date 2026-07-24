import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { PriceChart, type ChartSeriesConfig } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import { buildIndexedCompareRows } from "./priceChartData";
import "./app.css";

const MAX_TICKERS = 5;
const TICKER_RE = /^[A-Za-z0-9._^=-]{1,32}$/;

const CHART_SERIES_COLORS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
] as const;

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

const PRICE_CACHE_TTL_MS = 60_000;
const priceCache = new Map<string, { data: GetPricesResponse; fetchedAt: number }>();

function priceCacheKey(ticker: string, range: string, interval: string): string {
  return `${ticker}:${range}:${interval}`;
}

function filterSeriesByHorizon(data: GetPricesResponse, horizonDays: number): GetPricesResponse {
  if (horizonDays === Infinity) return data;
  const latestTimestamp = data.series[data.series.length - 1]?.timestamp;
  if (!latestTimestamp) return data;
  const cutoff = latestTimestamp - horizonDays * 24 * 60 * 60 * 1000;
  const filteredSeries = data.series.filter((p) => p.timestamp >= cutoff);
  return {
    ...data,
    series: filteredSeries.length > 0 ? filteredSeries : data.series.slice(-1),
  };
}

async function fetchTickerPrices(
  ticker: string,
  fetchRange: string,
  interval: string,
  signal: AbortSignal,
): Promise<GetPricesResponse> {
  const cacheKey = priceCacheKey(ticker, fetchRange, interval);
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetchPrices({ ticker, range: fetchRange, interval, signal });
  if (!res.ok) {
    throw new Error(res.error.error ?? "Request failed");
  }
  priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
  return res.data;
}

export default function App() {
  const formId = useId();
  const compareFormId = useId();
  const [tickers, setTickers] = useState<string[]>([DEFAULT_TICKER]);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [compareInput, setCompareInput] = useState("");
  const [compareFormError, setCompareFormError] = useState<string | null>(null);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [tickerData, setTickerData] = useState<Record<string, GetPricesResponse>>({});
  const [tickerErrors, setTickerErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const primaryTicker = tickers[0] ?? DEFAULT_TICKER;

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const horizon = HORIZONS[horizonIndex];
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;

    const results = await Promise.allSettled(
      tickers.map((symbol) => fetchTickerPrices(symbol, fetchRange, horizon.interval, signal)),
    );

    if (signal.aborted || requestId !== requestIdRef.current) return;

    const nextData: Record<string, GetPricesResponse> = {};
    const nextErrors: Record<string, string> = {};

    for (let index = 0; index < tickers.length; index++) {
      const symbol = tickers[index]!;
      const result = results[index];
      if (result?.status === "fulfilled") {
        nextData[symbol] = result.value;
      } else {
        const message =
          result?.status === "rejected" && result.reason instanceof Error
            ? result.reason.message
            : "Request failed";
        nextErrors[symbol] = message;
      }
    }

    setTickerData(nextData);
    setTickerErrors(nextErrors);
    setLoading(false);

    if (!nextData[primaryTicker]) {
      setError(nextErrors[primaryTicker] ?? "Could not load data");
    }
  }, [tickers, horizonIndex, primaryTicker]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const primaryData = useMemo(() => {
    const raw = tickerData[primaryTicker];
    if (!raw) return null;
    return filterSeriesByHorizon(raw, HORIZONS[horizonIndex].days);
  }, [tickerData, primaryTicker, horizonIndex]);

  const compareResponses = useMemo(() => {
    return tickers
      .filter((symbol) => tickerData[symbol])
      .map((symbol) => filterSeriesByHorizon(tickerData[symbol]!, HORIZONS[horizonIndex].days));
  }, [tickers, tickerData, horizonIndex]);

  const compareRows = useMemo(() => {
    if (compareResponses.length < 2) return null;
    return buildIndexedCompareRows(compareResponses);
  }, [compareResponses]);

  const chartSeries = useMemo((): ChartSeriesConfig[] => {
    return tickers
      .filter((symbol) => tickerData[symbol])
      .map((symbol) => ({
        ticker: symbol,
        colorVar: CHART_SERIES_COLORS[tickers.indexOf(symbol)] ?? CHART_SERIES_COLORS[0],
      }));
  }, [tickers, tickerData]);

  const isCompareMode = tickers.length >= 2 && chartSeries.length >= 2 && compareRows != null;
  const hasChartData = Boolean(primaryData && (isCompareMode ? compareRows!.length > 0 : primaryData.series.length > 0));

  const lastPriceDisplay = primaryData?.lastPrice ?? tickerData[primaryTicker]?.lastPrice ?? null;
  const currencyDisplay = primaryData?.currency ?? tickerData[primaryTicker]?.currency ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextPrimary = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setInputTicker(nextPrimary);
    setTickers((prev) => {
      const compare = prev.slice(1).filter((symbol) => symbol !== nextPrimary);
      return [nextPrimary, ...compare].slice(0, MAX_TICKERS);
    });
  }

  function onAddCompare(e: FormEvent) {
    e.preventDefault();
    const symbol = compareInput.trim().toUpperCase();
    if (!symbol) {
      setCompareFormError("Enter a ticker symbol.");
      return;
    }
    if (!TICKER_RE.test(symbol)) {
      setCompareFormError("Invalid ticker format.");
      return;
    }
    if (tickers.includes(symbol)) {
      setCompareFormError("Ticker is already on the chart.");
      return;
    }
    if (tickers.length >= MAX_TICKERS) {
      setCompareFormError("Maximum of 5 tickers.");
      return;
    }
    setCompareFormError(null);
    setCompareInput("");
    setTickers((prev) => [...prev, symbol]);
  }

  function removeCompare(symbol: string) {
    setTickers((prev) => [prev[0]!, ...prev.slice(1).filter((item) => item !== symbol)]);
    setTickerErrors((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  }

  const failedCompareTickers = tickers.slice(1).filter((symbol) => tickerErrors[symbol]);

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
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
      </header>

      <main className="main-content">
        {loading && !hasChartData && (
          <div className="card loading-card" aria-busy="true" aria-label="Loading chart">
            <div className="skeleton-toolbar" />
            <div className="skeleton-chart" />
          </div>
        )}

        {!loading && error && !hasChartData && (
          <div className="card error-banner" role="alert">
            <strong>Could not load data.</strong> {error}
          </div>
        )}

        {!error && hasChartData && primaryData && (
          <>
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{primaryTicker}</h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(primaryData);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive
                        ? "positive"
                        : percentChange.isNegative
                          ? "negative"
                          : "muted";
                      return <span className={`metric-badge ${statusClass}`}>{percentChange.text}</span>;
                    })()}
                  </div>

                  <div className="compare-toolbar">
                    <div className="compare-chips" aria-label="Tickers on chart">
                      {tickers.map((symbol, index) => (
                        <span
                          key={symbol}
                          className={`compare-chip ${index === 0 ? "compare-chip--primary" : ""} ${tickerErrors[symbol] ? "compare-chip--error" : ""}`}
                          style={{ "--chip-color": CHART_SERIES_COLORS[index] } as CSSProperties}
                        >
                          <span className="compare-chip__dot" aria-hidden="true" />
                          <span className="compare-chip__label">{symbol}</span>
                          {index > 0 ? (
                            <button
                              type="button"
                              className="compare-chip__remove"
                              onClick={() => removeCompare(symbol)}
                              aria-label={`Remove ${symbol} from comparison`}
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>

                    {tickers.length < MAX_TICKERS ? (
                      <form
                        className="compare-form"
                        onSubmit={onAddCompare}
                        aria-labelledby={`${compareFormId}-legend`}
                      >
                        <label id={`${compareFormId}-legend`} htmlFor={`${compareFormId}-compare`} className="sr-only">
                          Add compare ticker
                        </label>
                        <input
                          id={`${compareFormId}-compare`}
                          type="text"
                          value={compareInput}
                          onChange={(e) => {
                            setCompareInput(e.target.value.toUpperCase());
                            if (compareFormError) setCompareFormError(null);
                          }}
                          className="compare-input"
                          placeholder="Add ticker"
                          maxLength={32}
                          spellCheck={false}
                          autoComplete="off"
                        />
                        <button type="submit" className="compare-add-btn" disabled={loading}>
                          Add
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {compareFormError ? (
                    <p className="compare-form-error" role="alert">
                      {compareFormError}
                    </p>
                  ) : null}

                  {failedCompareTickers.length > 0 ? (
                    <div className="compare-errors" role="status">
                      Could not load:{" "}
                      {failedCompareTickers.map((symbol) => `${symbol} (${tickerErrors[symbol]})`).join("; ")}
                    </div>
                  ) : null}

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
                {isCompareMode && compareRows ? (
                  <PriceChart
                    mode="compare"
                    rows={compareRows}
                    series={chartSeries}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                ) : (
                  <PriceChart
                    mode="single"
                    data={primaryData}
                    variant={horizonIndex === 0 ? "intraday" : "daily"}
                  />
                )}
              </div>
              {loading ? (
                <div className="chart-loading-overlay" role="status">
                  Loading latest data...
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>
      <ReportBug />
    </div>
  );
}
