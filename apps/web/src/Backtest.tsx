import { useId, useRef, useState, type FormEvent } from "react";
import {
  calendarToday,
  computeBuyAtDateBacktest,
  DEFAULT_TICKER,
  validateBuyAtDateInput,
  type BuyAtDateBacktest,
} from "@stock/shared";
import { fetchPrices } from "./api";

function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatMoney(value: number, currency: string | null): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatSignedMoney(value: number, currency: string | null): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value, currency)}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${formatted}%`;
}

function pnlClass(value: number): string {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "muted";
}

export function Backtest() {
  const formId = useId();
  const [ticker, setTicker] = useState<string>(DEFAULT_TICKER);
  const [volume, setVolume] = useState("10");
  const [tradeDate, setTradeDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [result, setResult] = useState<BuyAtDateBacktest | null>(null);
  const requestIdRef = useRef(0);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const requestId = ++requestIdRef.current;
    const preview = validateBuyAtDateInput({ ticker, volume, tradeDate });
    if (!preview.ok) {
      setResult(null);
      setError(preview.error);
      return;
    }

    setLoading(true);
    setError(null);
    const normalizedTicker = preview.value.ticker;
    let res: Awaited<ReturnType<typeof fetchPrices>>;
    try {
      // Yahoo `range=max` is not a daily series (it returns coarse bars). `10y` is the
      // longest window this API serves at `interval=1d`, which weekend roll-forward needs.
      res = await fetchPrices({ ticker: normalizedTicker, range: "10y", interval: "1d" });
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setResult(null);
      setError(e instanceof Error ? e.message : "Request failed");
      return;
    }
    if (requestId !== requestIdRef.current) return;
    setLoading(false);
    if (!res.ok) {
      setResult(null);
      setCurrency(null);
      setError(res.error.error ?? "Could not load prices.");
      return;
    }

    const computed = computeBuyAtDateBacktest({
      ticker: normalizedTicker,
      volume: preview.value.volume.toString(),
      tradeDate: preview.value.tradeDate,
      series: res.data.series,
    });
    if (!computed.ok) {
      setResult(null);
      setCurrency(res.data.currency);
      setError(computed.error);
      return;
    }
    setCurrency(res.data.currency);
    setResult(computed.result);
  }

  const rolledForward = result != null && result.entryDate !== result.requestedDate;
  const today = calendarToday();

  return (
    <section className="card backtest-card" aria-labelledby={`${formId}-title`}>
      <div className="backtest-intro">
        <h2 id={`${formId}-title`} className="backtest-title">
          Backtest
        </h2>
        <p className="backtest-hint">
          Buy at the first daily close on or after this date, using up to 10 years of daily closes. P&amp;L runs through the latest close.
        </p>
      </div>

      <form className="backtest-form" onSubmit={onSubmit} noValidate>
        <div className="backtest-field">
          <label className="backtest-label" htmlFor={`${formId}-ticker`}>
            Ticker
          </label>
          <input
            id={`${formId}-ticker`}
            name="ticker"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="backtest-input"
            placeholder={`e.g. ${DEFAULT_TICKER}`}
          />
        </div>
        <div className="backtest-field">
          <label className="backtest-label" htmlFor={`${formId}-volume`}>
            Shares
          </label>
          <input
            id={`${formId}-volume`}
            name="volume"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="backtest-input backtest-input--volume"
            placeholder="10"
          />
        </div>
        <div className="backtest-field">
          <label className="backtest-label" htmlFor={`${formId}-date`}>
            Trade date
          </label>
          <input
            id={`${formId}-date`}
            name="tradeDate"
            type="date"
            max={today}
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            className="backtest-input"
          />
        </div>
        <button type="submit" className="search-btn backtest-submit" disabled={loading}>
          {loading ? "Running…" : "Run backtest"}
        </button>
      </form>

      {error && (
        <div className="error-banner backtest-error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="backtest-results" aria-live="polite">
          <p className="backtest-entry-note">
            Entry {formatIsoDate(result.entryDate)} at {formatMoney(result.entryClose, currency)}
            {rolledForward
              ? ` (next session on or after ${formatIsoDate(result.requestedDate)})`
              : ""}
            . Marked to {formatIsoDate(result.latestDate)}.
          </p>
          <dl className="backtest-metrics">
            <div className="backtest-metric">
              <dt>Entry price</dt>
              <dd>{formatMoney(result.entryClose, currency)}</dd>
            </div>
            <div className="backtest-metric">
              <dt>Cost basis</dt>
              <dd>{formatMoney(result.costBasis, currency)}</dd>
            </div>
            <div className="backtest-metric">
              <dt>Market value</dt>
              <dd>{formatMoney(result.marketValue, currency)}</dd>
            </div>
            <div className="backtest-metric">
              <dt>P&amp;L</dt>
              <dd className={pnlClass(result.pnlDollars)}>{formatSignedMoney(result.pnlDollars, currency)}</dd>
            </div>
            <div className="backtest-metric">
              <dt>P&amp;L %</dt>
              <dd className={pnlClass(result.pnlPercent)}>{formatSignedPercent(result.pnlPercent)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
