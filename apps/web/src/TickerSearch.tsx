import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { DEFAULT_TICKER, SEARCH_QUERY_MAX_LEN, type SearchResult } from "@stock/shared";
import { searchSymbols } from "./api";
import { splitMatches } from "./typeahead";

const DEBOUNCE_MS = 150;

type Suggestions =
  | { kind: "idle" }
  | { kind: "loading"; query: string }
  | { kind: "ready"; query: string; results: SearchResult[] }
  /** Search failed: no list, Enter still does exact-symbol lookup. */
  | { kind: "error" };

const resultCache = new Map<string, SearchResult[]>();

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitMatches(text, query).map((seg, i) =>
        seg.match ? (
          <span key={i} className="typeahead-match">
            {seg.text}
          </span>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

export function TickerSearch({ onSubmitSymbol, disabled }: { onSubmitSymbol: (symbol: string) => void; disabled: boolean }) {
  const id = useId();
  const inputId = `${id}-ticker`;
  const listboxId = `${id}-listbox`;
  const [value, setValue] = useState<string>(DEFAULT_TICKER);
  const [suggestions, setSuggestions] = useState<Suggestions>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function cancelPending() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }

  useEffect(() => cancelPending, []);

  async function runSearch(query: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    let res: Awaited<ReturnType<typeof searchSymbols>>;
    try {
      res = await searchSymbols(query, controller.signal);
    } catch {
      if (controller.signal.aborted) return;
      res = { ok: false, status: 0 };
    }
    if (controller.signal.aborted) return;
    abortRef.current = null;
    if (!res.ok) {
      setSuggestions({ kind: "error" });
      setOpen(false);
      return;
    }
    resultCache.set(query.toLowerCase(), res.data.results);
    setSuggestions({ kind: "ready", query, results: res.data.results });
  }

  function onChange(next: string) {
    setValue(next);
    setActiveIndex(-1);
    cancelPending();
    const query = next.trim().replace(/\s+/g, " ");
    if (!query) {
      setSuggestions({ kind: "idle" });
      setOpen(false);
      return;
    }
    setOpen(true);
    const cached = resultCache.get(query.toLowerCase());
    if (cached) {
      setSuggestions({ kind: "ready", query, results: cached });
      return;
    }
    setSuggestions((prev) => (prev.kind === "ready" && prev.results.length > 0 ? prev : { kind: "loading", query }));
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSearch(query);
    }, DEBOUNCE_MS);
  }

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function choose(result: SearchResult) {
    cancelPending();
    setValue(result.symbol);
    setSuggestions({ kind: "idle" });
    close();
    onSubmitSymbol(result.symbol);
  }

  const results = suggestions.kind === "ready" ? suggestions.results : [];
  const expanded = open && suggestions.kind !== "idle" && suggestions.kind !== "error";

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (results.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => {
        if (!expanded) return step === 1 ? 0 : results.length - 1;
        if (i === -1) return step === 1 ? 0 : results.length - 1;
        return (i + step + results.length) % results.length;
      });
    } else if (e.key === "Enter") {
      if (expanded && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      close();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    cancelPending();
    close();
    onSubmitSymbol(value.trim().toUpperCase() || DEFAULT_TICKER);
  }

  const activeId = expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;
  let statusText = "";
  if (expanded && suggestions.kind === "ready") {
    statusText =
      results.length === 0
        ? `No matches for '${suggestions.query}'`
        : `${results.length} suggestion${results.length === 1 ? "" : "s"}. Use up and down arrows to choose.`;
  }

  return (
    <form className="search-form" onSubmit={onSubmit} role="search">
      <label htmlFor={inputId} className="sr-only">
        Ticker or company name
      </label>
      <div className="search-input-wrapper">
        <input
          id={inputId}
          name="ticker"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={close}
          className="search-input"
          placeholder="Ticker or company"
          maxLength={SEARCH_QUERY_MAX_LEN}
        />
        <button type="submit" className="search-btn" disabled={disabled}>
          Search
        </button>
      </div>
      <div className="typeahead-popup" hidden={!expanded}>
        <ul id={listboxId} role="listbox" aria-label="Suggestions" className="typeahead-listbox">
          {results.map((r, i) => (
            <li
              key={r.symbol}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`typeahead-option${i === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActiveIndex(i)}
              onClick={() => choose(r)}
            >
              <span className="typeahead-symbol">
                <Highlighted text={r.symbol} query={suggestions.kind === "ready" ? suggestions.query : ""} />
              </span>
              <span className="typeahead-name">
                <Highlighted text={r.name} query={suggestions.kind === "ready" ? suggestions.query : ""} />
              </span>
            </li>
          ))}
        </ul>
        {suggestions.kind === "loading" && <div className="typeahead-message">Searching…</div>}
        {suggestions.kind === "ready" && results.length === 0 && (
          <div className="typeahead-message">No matches for &lsquo;{suggestions.query}&rsquo;</div>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {statusText}
      </div>
    </form>
  );
}
