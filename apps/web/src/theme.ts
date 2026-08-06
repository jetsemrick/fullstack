export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "stock-visualizer-theme";

export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveEffectiveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): "light" | "dark" {
  const effective = resolveEffectiveTheme(preference);
  document.documentElement.dataset.theme = effective;
  return effective;
}

export function setThemePreference(preference: ThemePreference): "light" | "dark" {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  return applyTheme(preference);
}
