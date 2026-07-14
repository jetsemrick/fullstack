export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "stock-visualizer-theme";

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  localStorage.setItem(STORAGE_KEY, preference);
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  return resolved;
}

export function initTheme(): ResolvedTheme {
  const resolved = resolveTheme(getStoredTheme());
  applyTheme(resolved);
  return resolved;
}

export function subscribeToSystemTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (getStoredTheme() === "system") {
      const resolved = getSystemTheme();
      applyTheme(resolved);
      onChange(resolved);
    }
  };
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}

export function subscribeToStorageChanges(onChange: (resolved: ResolvedTheme) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      const resolved = resolveTheme(getStoredTheme());
      applyTheme(resolved);
      onChange(resolved);
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function toggleTheme(): ResolvedTheme {
  const current = resolveTheme(getStoredTheme());
  return setThemePreference(current === "dark" ? "light" : "dark");
}
