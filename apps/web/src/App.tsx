import { useCallback, useEffect, useId, useState, useMemo, type FormEvent } from "react";
import { DEFAULT_TICKER, type GetPricesResponse } from "@stock/shared";
import { fetchPrices } from "./api";
import { downloadPricesCsv } from "./exportCsv";
import { PriceChart } from "./PriceChart";
import { MarketStrip } from "./MarketStrip";
import {
  ErrorBanner,
  ExportButton,
  LoadingChartCard,
  RetroCard,
  RetroMetricBadge,
  RetroSearchForm,
  RetroSegmentedControl,
} from "./components/RetroUi";
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
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [inputTicker, setInputTicker] = useState<string>(DEFAULT_TICKER);
  const [horizonIndex, setHorizonIndex] = useState<number>(0);

  const [data, setData] = useState<GetPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const horizon = HORIZONS[horizonIndex];
    const res = await fetchPrices({ ticker, range: horizon.range, interval: horizon.interval });
    setLoading(false);
    if (!res.ok) {
      setData(null);
      setError(res.error.error ?? "Request failed");
      return;
    }
    setData(res.data);
  }, [ticker, horizonIndex]);

  useEffect(() => {
    void load();
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = inputTicker.trim().toUpperCase() || DEFAULT_TICKER;
    setTicker(t);
  }

  return (
    <div className="shell">
      <header className="header">
        <MarketStrip />
        <RetroSearchForm
          formId={formId}
          value={inputTicker}
          disabled={loading}
          placeholderTicker={DEFAULT_TICKER}
          onChange={(value) => setInputTicker(value.toUpperCase())}
          onSubmit={onSubmit}
        />
      </header>

      <main className="main-content">
        {loading && <LoadingChartCard />}

        {!loading && error && <ErrorBanner error={error} />}

        {!loading && !error && data && displayData && (
          <>
            <RetroCard className="content-card">
              <div className="content-toolbar">
                <div className="metrics-block">
                  <div className="metrics-inline">
                    <h2 className="ticker-display">{data.ticker}</h2>
                    <RetroMetricBadge>{formatLast(lastPriceDisplay, currencyDisplay)}</RetroMetricBadge>
                    {(() => {
                      const percentChange = formatPercentChange(displayData);
                      if (!percentChange) return null;
                      const tone = percentChange.isPositive ? "positive" : percentChange.isNegative ? "negative" : "muted";
                      return (
                        <RetroMetricBadge tone={tone}>
                          {percentChange.text}
                        </RetroMetricBadge>
                      );
                    })()}
                  </div>
                  <RetroSegmentedControl
                    items={HORIZONS}
                    activeIndex={horizonIndex}
                    ariaLabel="Price history horizon"
                    onSelect={setHorizonIndex}
                  />
                </div>
              </div>
              <div
                className="chart-container"
                aria-label="Price chart"
              >
                <PriceChart
                  data={displayData}
                  variant={horizonIndex === 0 ? "intraday" : "daily"}
                />
              </div>
            </RetroCard>
            <div className="actions-footer">
              <ExportButton onClick={() => downloadPricesCsv(displayData)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
