import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { filterSeriesByHorizon, seriesHasVolume } from "./priceChartData";
import { PriceChart, type ChartOverlays } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
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
    isNegative: pct < 0
  };
}

const HORIZONS = [
  { label: "Today", days: 1, range: "1d", interval: "5m" },
  { label: "1 Year", days: 365, range: "1y", interval: "1d" },
  { label: "5 Year", days: 1825, range: "5y", interval: "1d" },
  { label: "All Time", days: Infinity, range: "max", interval: "1d" }
];

const PRICE_CACHE_TTL_MS = 60_000;
const OVERLAY_STORAGE_KEY = "stock-visualizer.overlays";
const DEFAULT_OVERLAYS: ChartOverlays = { sma50: false, sma200: false, volume: false };
const priceCache = new Map<string, { data: GetPricesResponse; fetchedAt: number }>();

function readOverlayToggles(): ChartOverlays {
  try {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (!raw) return DEFAULT_OVERLAYS;
    const parsed = JSON.parse(raw) as Partial<ChartOverlays>;
    return {
      sma50: parsed.sma50 === true,
      sma200: parsed.sma200 === true,
      volume: parsed.volume === true,
    };
  } catch {
    return DEFAULT_OVERLAYS;
  }
}

function writeOverlayToggles(next: ChartOverlays) {
  try {
    localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota — toggles still work for the session
  }
}

function priceCacheKey(ticker: string, range: string, interval: string): string {
  return `${ticker}:${range}:${interval}`;
}

export default function App() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<ChartOverlays>(readOverlayToggles);
  const requestIdRef = useRef(0);

  useEffect(() => {
    writeOverlayToggles(overlays);
  }, [overlays]);

  const load = useCallback(async (signal: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const fetchRange = horizon.days > 1 ? "max" : horizon.range;
    const cacheKey = priceCacheKey(ticker, fetchRange, horizon.interval);
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    let res: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      res = await fetchPrices({ ticker, range: fetchRange, interval: horizon.interval, signal });
    } catch (e) {
      if (signal.aborted) return;
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setError(e instanceof Error ? e.message : "Request failed");
      return;
    }
    if (signal.aborted || requestId !== requestIdRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setError(res.error.error ?? "Request failed");
      return;
    }
    priceCache.set(cacheKey, { data: res.data, fetchedAt: Date.now() });
    setData(res.data);
  }, [ticker, horizonIndex]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  const slicedDaily = useMemo(() => {
    if (!data) return null;
    return filterSeriesByHorizon(data, HORIZONS[horizonIndex].days);
  }, [data, horizonIndex]);

  const displayData = useMemo(() => {
    if (!slicedDaily) return null;
    return slicedDaily;
  }, [slicedDaily]);

  const lastPriceDisplay = displayData?.lastPrice ?? data?.lastPrice ?? null;
  const currencyDisplay = displayData?.currency ?? data?.currency ?? null;
  const hasChartData = Boolean(data && displayData);
  const isDailyHorizon = horizonIndex !== 0;
  const hasVolume = Boolean(data && seriesHasVolume(data.series));
  const anyOverlayOn = Boolean(overlays.sma50 || overlays.sma200 || overlays.volume);

  function toggleOverlay(key: keyof ChartOverlays) {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
          <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">Ticker</label>
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
      </header>

      <main className="main-content">
        {loading && !hasChartData && (
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

        {!error && data && displayData && (
          <>
            <div className="card content-card chart-card--loading-context" aria-busy={loading}>
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{data.ticker}</h2>
                    <span className="metric-badge">{formatLast(lastPriceDisplay, currencyDisplay)}</span>
                    {(() => {
                      const percentChange = formatPercentChange(displayData);
                      if (!percentChange) return null;
                      const statusClass = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                      return (
                        <span className={`metric-badge ${statusClass}`}>
                          {percentChange.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="toolbar-controls">
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
                    {isDailyHorizon ? (
                      <div className="overlay-toggles" role="group" aria-label="Chart overlays">
                        <span className="overlay-label">Overlays</span>
                        <button
                          type="button"
                          className={`overlay-btn overlay-btn--sma50 ${overlays.sma50 ? "active" : ""}`}
                          aria-pressed={Boolean(overlays.sma50)}
                          onClick={() => toggleOverlay("sma50")}
                        >
                          SMA 50
                        </button>
                        <button
                          type="button"
                          className={`overlay-btn overlay-btn--sma200 ${overlays.sma200 ? "active" : ""}`}
                          aria-pressed={Boolean(overlays.sma200)}
                          onClick={() => toggleOverlay("sma200")}
                        >
                          SMA 200
                        </button>
                        <button
                          type="button"
                          className={`overlay-btn overlay-btn--volume ${overlays.volume ? "active" : ""}`}
                          aria-pressed={Boolean(overlays.volume)}
                          aria-disabled={!hasVolume}
                          disabled={!hasVolume}
                          onClick={() => toggleOverlay("volume")}
                        >
                          Volume
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  data={displayData}
                  overlaySource={isDailyHorizon ? data : undefined}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                  overlays={overlays}
                />
              </div>
              {isDailyHorizon && anyOverlayOn ? (
                <aside className="overlay-legend" aria-label="Overlay legend">
                  {overlays.sma50 ? (
                    <p>
                      <strong>SMA 50</strong> is the average closing price over the last 50 trading days.
                      It tracks the medium-term trend.
                    </p>
                  ) : null}
                  {overlays.sma200 ? (
                    <p>
                      <strong>SMA 200</strong> is the average close over the last 200 trading days.
                      Price staying above this line is often read as a long-term uptrend.
                    </p>
                  ) : null}
                  {overlays.volume ? (
                    <p>
                      <strong>Volume</strong> is how many shares traded that day. Heavier volume can
                      confirm that a price move has conviction behind it.
                    </p>
                  ) : null}
                  <p>
                    A <strong>golden cross</strong> is the 50-day average crossing above the 200-day
                    average (often treated as bullish). A <strong>death cross</strong> is the 50-day
                    crossing below the 200-day (often treated as bearish).
                  </p>
                </aside>
              ) : null}
              {loading && (
                <div className="chart-loading-overlay" role="status">
                  Loading latest data...
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <ReportBug />
    </div>
  );
}
