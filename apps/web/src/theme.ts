export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "stock-visualizer-theme";

const VALID_PREFERENCES = new Set<ThemePreference>(["light", "dark", "system"]);

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && VALID_PREFERENCES.has(stored as ThemePreference)) {
      return stored as ThemePreference;
    }
  } catch {
    /* localStorage may be unavailable */
  }
  return "system";
}

export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", preference);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* localStorage may be unavailable */
  }
  applyThemePreference(preference);
}

/** Inline script source for index.html — runs before paint to avoid theme flash. */
export const themeInitScript = `(()=>{try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var v=localStorage.getItem(k);var t=v==="light"||v==="dark"||v==="system"?v:"system";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","system")}})();`;
