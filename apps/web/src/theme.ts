export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "stock-visualizer-theme";

export function getStoredThemePreference(): ThemePreference {
  let stored: string | null;
  try {
    stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return "system";
  }
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveEffectiveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): "light" | "dark" {
  const effective = resolveEffectiveTheme(preference);
  document.documentElement.dataset.theme = effective;
  return effective;
}

export function setThemePreference(preference: ThemePreference): "light" | "dark" {
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The in-memory preference still applies when storage is unavailable.
  }
  return applyTheme(preference);
}
