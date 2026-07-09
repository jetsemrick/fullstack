import { useCallback, useEffect, useState } from "react";
import {
  applyThemePreference,
  readStoredTheme,
  setThemePreference,
  type ThemePreference,
} from "./theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyThemePreference(preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemePreference("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    setPreference(next);
  }, []);

  return { preference, setTheme };
}
