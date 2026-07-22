import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_TICKER,
  computeBacktest,
  type BacktestResult,
} from "@stock/shared";
import { fetchPrices } from "./api";

function formatCurrency(value: number, currency: string | null): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function getTodayDateString(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function BacktestForm() {
  const formId = useId();
  const [ticker, setTicker] = useState("");
  const [volume, setVolume] = useState("");
  const [tradeDate, setTradeDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const requestId = ++requestIdRef.current;
      setError(null);
      setResult(null);
      setCurrency(null);

      const tickerVal = ticker.trim().toUpperCase() || DEFAULT_TICKER;
      const volumeVal = parseFloat(volume);
      const tradeDateVal = tradeDate.trim();

      if (!Number.isFinite(volumeVal) || volumeVal <= 0) {
        setError("Volume must be a positive number");
        return;
      }

      if (!tradeDateVal) {
        setError("Trade date is required");
        return;
      }

      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tradeDateVal);
      if (!dateMatch) {
        setError("Trade date must be in YYYY-MM-DD format");
        return;
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const [, y, m, d] = dateMatch;
      const inputDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      if (inputDate > today) {
        setError("Trade date cannot be in the future");
        return;
      }

      setLoading(true);

      try {
        // Calculate appropriate range based on trade date to ensure daily resolution
        const tradeDateObj = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
        const now = new Date();
        const daysDiff = Math.ceil((now.getTime() - tradeDateObj.getTime()) / (1000 * 60 * 60 * 24));
        
        // Select range to ensure we get daily data (Yahoo aggregates to monthly for very long ranges)
        let range = "max";
        if (daysDiff <= 365) {
          range = "1y";
        } else if (daysDiff <= 2 * 365) {
          range = "2y";
        } else if (daysDiff <= 5 * 365) {
          range = "5y";
        } else if (daysDiff <= 10 * 365) {
          range = "10y";
        }
        // For dates older than 10 years, use max and accept monthly resolution

        const res = await fetchPrices({
          ticker: tickerVal,
          range,
          interval: "1d",
        });

        if (requestId !== requestIdRef.current) return;

        if (!res.ok) {
          setError(res.error.error || "Failed to fetch prices");
          setLoading(false);
          return;
        }

        const backtestResult = computeBacktest({
          series: res.data.series,
          tradeDate: tradeDateVal,
          volume: volumeVal,
        });

        if (!backtestResult.ok) {
          setError(backtestResult.error.message);
          setLoading(false);
          return;
        }

        setCurrency(res.data.currency);
        setResult(backtestResult.result);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [ticker, volume, tradeDate]
  );

  const pnlClass = result
    ? result.pnlDollars > 0
      ? "positive"
      : result.pnlDollars < 0
        ? "negative"
        : "muted"
    : "";

  return (
    <div className="backtest-section">
      <h3 className="backtest-title">Buy-at-Date Backtest</h3>
      <form className="backtest-form" onSubmit={handleSubmit}>
        <div className="backtest-inputs">
          <div className="backtest-field">
            <label htmlFor={`${formId}-ticker`} className="backtest-label">
              Ticker
            </label>
            <input
              id={`${formId}-ticker`}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder={DEFAULT_TICKER}
              className="backtest-input"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="backtest-field">
            <label htmlFor={`${formId}-volume`} className="backtest-label">
              Shares
            </label>
            <input
              id={`${formId}-volume`}
              type="number"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="10"
              className="backtest-input"
              min="0.0001"
              step="any"
            />
          </div>
          <div className="backtest-field">
            <label htmlFor={`${formId}-date`} className="backtest-label">
              Trade Date
            </label>
            <input
              id={`${formId}-date`}
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              className="backtest-input"
              max={getTodayDateString()}
            />
          </div>
          <button
            type="submit"
            className="backtest-submit"
            disabled={loading}
          >
            {loading ? "Loading..." : "Calculate"}
          </button>
        </div>
      </form>

      {error && (
        <div className="backtest-error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="backtest-results">
          <div className="backtest-result-row">
            <span className="backtest-result-label">Entry Date</span>
            <span className="backtest-result-value">{result.entryDate}</span>
          </div>
          <div className="backtest-result-row">
            <span className="backtest-result-label">Entry Price</span>
            <span className="backtest-result-value">
              {formatCurrency(result.entryPrice, currency)}
            </span>
          </div>
          <div className="backtest-result-row">
            <span className="backtest-result-label">Latest Price</span>
            <span className="backtest-result-value">
              {formatCurrency(result.latestPrice, currency)}
            </span>
          </div>
          <div className="backtest-result-row">
            <span className="backtest-result-label">Cost Basis</span>
            <span className="backtest-result-value">
              {formatCurrency(result.costBasis, currency)}
            </span>
          </div>
          <div className="backtest-result-row">
            <span className="backtest-result-label">Market Value</span>
            <span className="backtest-result-value">
              {formatCurrency(result.marketValue, currency)}
            </span>
          </div>
          <div className="backtest-result-row backtest-result-row--highlight">
            <span className="backtest-result-label">P&L</span>
            <span className={`backtest-result-value backtest-pnl ${pnlClass}`}>
              {result.pnlDollars >= 0 ? "+" : ""}{formatCurrency(result.pnlDollars, currency)} ({formatPercent(result.pnlPercent)})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
