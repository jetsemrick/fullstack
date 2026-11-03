import { useRef, type KeyboardEvent } from "react";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  ariaLabel?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    buttonsRef.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = selectedIndex === last ? 0 : selectedIndex + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = selectedIndex === 0 ? last : selectedIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={className ? `segmented ${className}` : "segmented"}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const checked = i === selectedIndex;
        return (
          <button
            key={o.value}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            tabIndex={checked ? 0 : -1}
            className="segmented__option"
            onClick={() => select(i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
