import { useId, useState, type FormEvent } from "react";
import { MAX_COMPARE_TICKERS, type NormalizeMode } from "./compareChartData";
import type { CompareLoadError } from "./useComparePrices";

type CompareTickerBarProps = {
  tickers: string[];
  normalizeMode: NormalizeMode;
  compareEnabled: boolean;
  errors: CompareLoadError[];
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
  onNormalizeModeChange: (mode: NormalizeMode) => void;
};

export function CompareTickerBar({
  tickers,
  normalizeMode,
  compareEnabled,
  errors,
  onAdd,
  onRemove,
  onNormalizeModeChange,
}: CompareTickerBarProps) {
  const formId = useId();
  const [input, setInput] = useState("");

  if (!compareEnabled) {
    return (
      <p className="compare-hint muted">Compare available on 1Y+ horizons.</p>
    );
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    onAdd(t);
    setInput("");
  }

  const atCap = tickers.length >= MAX_COMPARE_TICKERS;

  return (
    <div className="compare-bar">
      <div className="compare-bar__row">
        <span className="compare-bar__label">Compare</span>
        <div className="compare-chips" role="list" aria-label="Compared tickers">
          {tickers.map((t, i) => (
            <span key={t} className="compare-chip" role="listitem">
              <span className="compare-chip__symbol">{t}</span>
              {i === 0 && tickers.length > 1 && (
                <span className="compare-chip__primary">Primary</span>
              )}
              {tickers.length > 1 && (
                <button
                  type="button"
                  className="compare-chip__remove"
                  onClick={() => onRemove(t)}
                  aria-label={`Remove ${t} from compare`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {!atCap && (
          <form className="compare-add-form" onSubmit={handleAdd}>
            <label htmlFor={`${formId}-add`} className="sr-only">
              Add ticker to compare
            </label>
            <input
              id={`${formId}-add`}
              type="text"
              className="compare-add-input"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Add symbol"
              maxLength={32}
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="compare-add-btn" disabled={!input.trim()}>
              Add
            </button>
          </form>
        )}
      </div>
      {tickers.length >= 2 && (
        <div className="compare-bar__row compare-bar__normalize">
          <span className="compare-bar__label">Scale</span>
          <div className="normalize-toggle" role="group" aria-label="Chart normalization">
            <button
              type="button"
              className={`normalize-btn ${normalizeMode === "indexed" ? "active" : ""}`}
              onClick={() => onNormalizeModeChange("indexed")}
            >
              Indexed
            </button>
            <button
              type="button"
              className={`normalize-btn ${normalizeMode === "absolute" ? "active" : ""}`}
              onClick={() => onNormalizeModeChange("absolute")}
            >
              Absolute
            </button>
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <ul className="compare-errors" role="alert">
          {errors.map((e) => (
            <li key={e.ticker}>
              <strong>{e.ticker}:</strong> {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
