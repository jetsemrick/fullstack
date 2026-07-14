import { useEffect, useState } from "react";
import {
  getStoredTheme,
  resolveTheme,
  subscribeToSystemTheme,
  toggleTheme,
  type ResolvedTheme,
} from "./theme";

function ThemeIcon({ theme }: { theme: ResolvedTheme }) {
  if (theme === "dark") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.75v2.5M12 18.75v2.5M4.22 4.22l1.77 1.77M18.01 18.01l1.77 1.77M2.75 12h2.5M18.75 12h2.5M4.22 19.78l1.77-1.77M18.01 5.99l1.77-1.77"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  useEffect(() => subscribeToSystemTheme(setTheme), []);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(toggleTheme())}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <ThemeIcon theme={theme} />
      <span className="sr-only">
        {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        {getStoredTheme() === "system" ? " (following system preference)" : ""}
      </span>
    </button>
  );
}
