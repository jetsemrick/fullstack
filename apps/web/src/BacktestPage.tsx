import { useId, useRef, useState, type FormEvent } from "react";
import { DEFAULT_TICKER } from "@stock/shared";
import { fetchPrices } from "./api";
import { calculateBacktest, parseTradeDate, type BacktestResult } from "./backtest";
import { MarketStrip } from "./MarketStrip";
import { ReportBug } from "./ReportBug";
import { SiteNav } from "./SiteNav";

function formatMoney(value: number, currency: string | null) {
  if (currency) {
    try {
      return value.toLocaleString(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      // Fall through when an upstream currency code is not supported.
    }
  }
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${currency ? ` ${currency}` : ""}`;
}

function formatSessionDate(timestamp: number, exchangeTimezoneName: string | null) {
  try {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      timeZone: exchangeTimezoneName ?? "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}

function getLocalDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BacktestPage() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [volume, setVolume] = useState("10");
  const [tradeDate, setTradeDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    ticker: string;
    currency: string | null;
    exchangeTimezoneName: string | null;
    values: BacktestResult;
  } | null>(null);
  const requestIdRef = useRef(0);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const requestedTicker = ticker.trim().toUpperCase();
    const requestedVolume = Number(volume);
    const tradeDateMs = parseTradeDate(tradeDate);

    setResult(null);
    if (!requestedTicker) {
      setError("Enter a ticker symbol.");
      return;
    }
    if (!Number.isFinite(requestedVolume) || requestedVolume <= 0) {
      setError("Share volume must be greater than zero.");
      return;
    }
    if (tradeDateMs == null) {
      setError("Enter a valid trade date.");
      return;
    }
    if (tradeDate > getLocalDateString()) {
      setError("Trade date cannot be in the future.");
      return;
    }

    const requestId = ++requestIdRef.current;
    setError(null);
    setLoading(true);

    try {
      const response = await fetchPrices({
        ticker: requestedTicker,
        range: "max",
        interval: "1d",
      });
      if (requestId !== requestIdRef.current) return;
      if (!response.ok) {
        setError(response.error.error || "Could not load price history.");
        return;
      }

      const calculation = calculateBacktest(
        response.data.series,
        requestedVolume,
        tradeDate,
        response.data.exchangeTimezoneName,
      );
      if (!calculation.ok) {
        setError(calculation.error);
        return;
      }
      setResult({
        ticker: response.data.ticker,
        currency: response.data.currency,
        exchangeTimezoneName: response.data.exchangeTimezoneName,
        values: calculation.result,
      });
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(requestError instanceof Error ? requestError.message : "Could not load price history.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  return (
    <div className="shell">
      <SiteNav current="backtest" />
      <header className="header page-header">
        <MarketStrip />
      </header>

      <main className="main-content">
        <section className="card backtest-card" aria-labelledby={`${formId}-title`}>
          <div className="backtest-heading">
            <div>
              <p className="backtest-eyebrow">Hypothetical trade</p>
              <h1 id={`${formId}-title`} className="backtest-title">Buy-at-date backtest</h1>
            </div>
            <p className="backtest-description">
              Calculate unrealized profit or loss from the first market close on or after your trade date.
            </p>
          </div>

          <form className="backtest-form" onSubmit={onSubmit} noValidate>
            <label className="backtest-field" htmlFor={`${formId}-ticker`}>
              <span>Ticker</span>
              <input
                id={`${formId}-ticker`}
                name="ticker"
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                placeholder="AAPL"
              />
            </label>
            <label className="backtest-field" htmlFor={`${formId}-volume`}>
              <span>Shares</span>
              <input
                id={`${formId}-volume`}
                name="volume"
                type="number"
                min="0"
                step="any"
                value={volume}
                onChange={(event) => setVolume(event.target.value)}
                placeholder="10"
              />
            </label>
            <label className="backtest-field" htmlFor={`${formId}-date`}>
              <span>Trade date</span>
              <input
                id={`${formId}-date`}
                name="tradeDate"
                type="date"
                max={getLocalDateString()}
                value={tradeDate}
                onChange={(event) => setTradeDate(event.target.value)}
              />
            </label>
            <button className="backtest-submit" type="submit" disabled={loading}>
              {loading ? "Calculating..." : "Run backtest"}
            </button>
          </form>

          {error && <p className="backtest-error" role="alert">{error}</p>}

          {result && (
            <div className="backtest-results" aria-live="polite">
              <div className="backtest-summary">
                <div>
                  <span className="backtest-result-label">Entry used</span>
                  <strong>{formatSessionDate(result.values.entryTimestamp, result.exchangeTimezoneName)}</strong>
                </div>
                <div>
                  <span className="backtest-result-label">Entry close</span>
                  <strong>{formatMoney(result.values.entryClose, result.currency)}</strong>
                </div>
                <div>
                  <span className="backtest-result-label">Latest close</span>
                  <strong>{formatMoney(result.values.latestClose, result.currency)}</strong>
                  <small>{formatSessionDate(result.values.latestTimestamp, result.exchangeTimezoneName)}</small>
                </div>
              </div>
              <div className="backtest-metrics">
                <div className="backtest-metric">
                  <span>Cost basis</span>
                  <strong>{formatMoney(result.values.costBasis, result.currency)}</strong>
                </div>
                <div className="backtest-metric">
                  <span>Market value</span>
                  <strong>{formatMoney(result.values.marketValue, result.currency)}</strong>
                </div>
                <div className={`backtest-metric ${result.values.profitLoss > 0 ? "positive" : result.values.profitLoss < 0 ? "negative" : ""}`}>
                  <span>Unrealized P&amp;L</span>
                  <strong>
                    {formatMoney(result.values.profitLoss, result.currency)}
                    {" "}
                    ({result.values.profitLossPercent > 0 ? "+" : ""}
                    {result.values.profitLossPercent.toFixed(2)}%)
                  </strong>
                </div>
              </div>
              <p className="backtest-footnote">
                {result.values.volume.toLocaleString()} {result.ticker} shares using unadjusted daily closes.
              </p>
            </div>
          )}
        </section>
      </main>
      <ReportBug />
    </div>
  );
}
