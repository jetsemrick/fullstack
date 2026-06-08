import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  getStoredTheme,
  nextTheme,
  setStoredTheme,
  type Theme,
  themeLabel,
} from "./theme";

let currentTheme = getStoredTheme();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function emit() {
  for (const listener of listeners) listener();
}

function setTheme(theme: Theme) {
  currentTheme = theme;
  setStoredTheme(theme);
  applyTheme(theme);
  emit();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system" as Theme);

  const toggle = useCallback(() => {
    setTheme(nextTheme(theme));
  }, [theme]);

  const select = useCallback((next: Theme) => {
    setTheme(next);
  }, []);

  return { theme, label: themeLabel(theme), toggle, select };
}
