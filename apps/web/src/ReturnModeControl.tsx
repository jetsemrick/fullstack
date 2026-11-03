import { useId, useRef, type KeyboardEvent } from "react";
import type { ReturnMode } from "@stock/shared";
import { RETURN_MODE_LABEL } from "./priceChartData";

const OPTIONS: { mode: ReturnMode; label: string }[] = [
  { mode: "price", label: RETURN_MODE_LABEL.price },
  { mode: "total", label: RETURN_MODE_LABEL.total },
];

/**
 * Two-segment Price / Total return radiogroup. When `disabledReason` is set the segments stay
 * focusable (so keyboard users reach the explanation) but ignore selection.
 */
export function ReturnModeControl({
  value,
  onChange,
  disabledReason,
}: {
  value: ReturnMode;
  onChange: (mode: ReturnMode) => void;
  disabledReason: string | null;
}) {
  const hintId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = disabledReason !== null;

  function select(index: number) {
    if (disabled) return;
    onChange(OPTIONS[index]!.mode);
    refs.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = OPTIONS.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div className="view-control">
      <div
        className="segmented"
        role="radiogroup"
        aria-label="Chart return mode"
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? hintId : undefined}
      >
        {OPTIONS.map((o, i) => {
          const checked = o.mode === value;
          return (
            <button
              key={o.mode}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              className="segment"
              aria-checked={checked}
              aria-disabled={disabled || undefined}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {disabled ? (
        <span id={hintId} role="tooltip" className="view-control__hint">
          {disabledReason}
        </span>
      ) : null}
    </div>
  );
}
