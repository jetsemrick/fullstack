import { useEffect, useState } from "react";
import {
  applyThemeToDocument,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type ThemePreference,
} from "./theme";

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme(localStorage));
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setPrefersDark(media.matches);
      applyThemeToDocument(preference, media.matches, document.documentElement);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference]);

  function toggle() {
    const next: ThemePreference = resolved === "dark" ? "light" : "dark";
    writeStoredTheme(next, localStorage);
    setPreference(next);
  }

  const label = resolved === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      aria-pressed={resolved === "dark"}
      title={label}
    >
      {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.64 5.64l1.56 1.56M16.8 16.8l1.56 1.56M5.64 18.36l1.56-1.56M16.8 7.2l1.56-1.56"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.4 3.6A8.4 8.4 0 1 0 20.4 16 6.6 6.6 0 0 1 15.4 3.6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
