import { useEffect, useState } from "react";
import {
  applyResolvedTheme,
  persistThemeMode,
  readStoredThemeMode,
  resolveTheme,
  type ThemeMode,
} from "./theme";

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "system", label: "System" },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyResolvedTheme(resolveTheme(mode, media.matches));
    apply();
    persistThemeMode(mode);
    if (mode !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {OPTIONS.map((option) => {
        const selected = mode === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`theme-toggle__btn${selected ? " theme-toggle__btn--active" : ""}`}
            onClick={() => setMode(option.mode)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
