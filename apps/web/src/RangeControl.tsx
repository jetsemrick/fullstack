import { useEffect, useRef, type KeyboardEvent } from "react";
import type { RangeOption } from "./ranges";

type Props = {
  options: readonly RangeOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

/** Single-select pill segmented control using the ARIA radiogroup pattern (roving tabindex, arrow keys). */
export function RangeControl({ options, selectedIndex, onSelect }: Props) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const button = buttonsRef.current[selectedIndex];
    if (!scroller || !button) return;
    // `.range-scroller` is position: relative, so offsetLeft is measured from it.
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < scroller.scrollLeft) scroller.scrollLeft = left;
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
  }, [selectedIndex]);

  function move(next: number) {
    const index = (next + options.length) % options.length;
    onSelect(index);
    buttonsRef.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        move(selectedIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        move(selectedIndex - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(options.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  return (
    <div className="range-scroller" ref={scrollerRef}>
      <div className="range-control" role="radiogroup" aria-label="Chart range" onKeyDown={onKeyDown}>
        {options.map((o, i) => {
          const selected = i === selectedIndex;
          return (
            <button
              key={o.id}
              ref={(el) => {
                buttonsRef.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.ariaLabel}
              tabIndex={selected ? 0 : -1}
              className="range-segment"
              onClick={() => onSelect(i)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
