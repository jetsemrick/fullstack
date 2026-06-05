import { useCallback, useEffect, useState } from "react";
import {
  getResolvedTheme,
  getStoredTheme,
  getSystemTheme,
  setTheme,
  type Theme,
} from "./theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getResolvedTheme());
  const [usesSystem, setUsesSystem] = useState(() => getStoredTheme() === null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === null) {
        setThemeState(getSystemTheme());
        setUsesSystem(true);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    setThemeState(next);
    setUsesSystem(false);
  }, [theme]);

  return { theme, usesSystem, toggleTheme };
}
