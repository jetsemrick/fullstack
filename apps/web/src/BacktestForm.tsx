import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import {
  computeBacktest,
  dateStringToTimestamp,
  timestampToDateString,
  DEFAULT_TICKER,
  type GetPricesResponse,
  type BacktestResult,
  type BacktestError,
} from "@stock/shared";
import { fetchPrices } from "./api";
import "./backtest.css";

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function getOneYearAgoString(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().split("T")[0];
}

export function BacktestForm() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [volume, setVolume] = useState<string>("10");
  const [tradeDate, setTradeDate] = useState<string>(getOneYearAgoString());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setResult(null);

      const requestId = ++requestIdRef.current;
      const tickerValue = ticker.trim().toUpperCase();
      if (!tickerValue) {
        setError("Ticker is required");
        return;
      }

      const volumeNum = parseFloat(volume);
      if (!Number.isFinite(volumeNum) || volumeNum <= 0) {
        setError("Volume must be a positive number");
        return;
      }

      if (!tradeDate) {
        setError("Trade date is required");
        return;
      }

      const tradeDateTs = dateStringToTimestamp(tradeDate);
      const todayTs = Math.floor(Date.now() / 1000);
      if (tradeDateTs > todayTs) {
        setError("Trade date cannot be in the future");
        return;
      }

      setLoading(true);

      const now = Date.now();
      const tradeDateMs = tradeDateTs * 1000;
      const yearsAgo = (now - tradeDateMs) / (365.25 * 24 * 60 * 60 * 1000);
      const range = yearsAgo <= 2 ? "2y" : yearsAgo <= 5 ? "5y" : yearsAgo <= 10 ? "10y" : "max";

      let priceData: GetPricesResponse;
      try {
        const res = await fetchPrices({
          ticker: tickerValue,
          range,
          interval: "1d",
        });
        if (requestId !== requestIdRef.current) return;
        if (!res.ok) {
          setLoading(false);
          setError(res.error.error ?? "Failed to fetch price data");
          return;
        }
        priceData = res.data;
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to fetch price data");
        return;
      }

      setCurrency(priceData.currency);

      const backtestResult = computeBacktest({
        tradeDateTimestamp: tradeDateTs,
        volume: volumeNum,
        series: priceData.series,
      });

      setLoading(false);

      if (!backtestResult.ok) {
        const errMap: Record<BacktestError["code"], string> = {
          INVALID_VOLUME: "Volume must be a positive number",
          DATA_NOT_AVAILABLE_YET: `Price data is not yet available for ${tradeDate}`,
          EMPTY_SERIES: `No price data available for ${tickerValue}`,
          DATA_STARTS_AFTER_DATE: `Historical data for ${tickerValue} does not go back to ${tradeDate}`,
          NO_DATA_ON_OR_AFTER_DATE: `No trading data available on or after ${tradeDate}`,
        };
        setError(errMap[backtestResult.error.code] ?? backtestResult.error.message);
        return;
      }

      setResult(backtestResult.result);
    },
    [ticker, volume, tradeDate]
  );

  const currencySymbol = currency === "USD" ? "$" : currency ? `${currency} ` : "";

  return (
    <div className="backtest-panel">
      <h2 className="backtest-title">Buy-at-Date Backtest</h2>
      <p className="backtest-hint">
        Enter a ticker, volume, and past trade date to see unrealized P&L.
      </p>

      <form className="backtest-form" onSubmit={handleSubmit}>
        <div className="backtest-form__row">
          <div className="backtest-form__field">
            <label htmlFor={`${formId}-ticker`} className="backtest-form__label">
              Ticker
            </label>
            <input
              id={`${formId}-ticker`}
              type="text"
              className="backtest-form__input"
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value.toUpperCase());
                setResult(null);
              }}
              placeholder="AAPL"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="backtest-form__field">
            <label htmlFor={`${formId}-volume`} className="backtest-form__label">
              Shares
            </label>
            <input
              id={`${formId}-volume`}
              type="number"
              className="backtest-form__input"
              value={volume}
              onChange={(e) => {
                setVolume(e.target.value);
                setResult(null);
              }}
              placeholder="10"
              min="0.001"
              step="any"
            />
          </div>

          <div className="backtest-form__field">
            <label htmlFor={`${formId}-date`} className="backtest-form__label">
              Trade Date
            </label>
            <input
              id={`${formId}-date`}
              type="date"
              className="backtest-form__input"
              value={tradeDate}
              onChange={(e) => {
                setTradeDate(e.target.value);
                setResult(null);
              }}
              max={getTodayString()}
            />
          </div>
        </div>

        <button
          type="submit"
          className="backtest-form__submit"
          disabled={loading}
        >
          {loading ? "Calculating..." : "Calculate P&L"}
        </button>
      </form>

      {error && (
        <div className="backtest-error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="backtest-results">
          <div className="backtest-results__header">
            <span className="backtest-results__ticker">{ticker.toUpperCase()}</span>
            <span className="backtest-results__entry-info">
              Entry: {timestampToDateString(result.entryTimestamp)} @ {currencySymbol}
              {formatCurrency(result.entryPrice)}
            </span>
          </div>

          <div className="backtest-results__grid">
            <div className="backtest-results__item">
              <span className="backtest-results__label">Cost Basis</span>
              <span className="backtest-results__value">
                {currencySymbol}{formatCurrency(result.costBasis)}
              </span>
            </div>

            <div className="backtest-results__item">
              <span className="backtest-results__label">Market Value</span>
              <span className="backtest-results__value">
                {currencySymbol}{formatCurrency(result.marketValue)}
              </span>
            </div>

            <div className="backtest-results__item">
              <span className="backtest-results__label">Dollar P&L</span>
              <span
                className={`backtest-results__value ${
                  result.dollarPnL >= 0 ? "backtest-results__value--positive" : "backtest-results__value--negative"
                }`}
              >
                {result.dollarPnL >= 0 ? "+" : ""}
                {currencySymbol}{formatCurrency(Math.abs(result.dollarPnL))}
              </span>
            </div>

            <div className="backtest-results__item">
              <span className="backtest-results__label">Percent P&L</span>
              <span
                className={`backtest-results__value ${
                  result.percentPnL >= 0 ? "backtest-results__value--positive" : "backtest-results__value--negative"
                }`}
              >
                {formatPercent(result.percentPnL)}
              </span>
            </div>
          </div>

          <div className="backtest-results__footer">
            Latest: {timestampToDateString(result.latestTimestamp)} @ {currencySymbol}
            {formatCurrency(result.latestPrice)}
          </div>
        </div>
      )}
    </div>
  );
}
