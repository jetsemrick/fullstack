export const THEME_STORAGE_KEY = "sv-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type ThemeRoot = {
  classList: {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
  };
  style: { colorScheme: string };
};

/** Keep in sync with the blocking script in `apps/web/index.html`. */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function readStoredTheme(storage: Pick<Storage, "getItem">): ThemePreference {
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeStoredTheme(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem" | "removeItem">,
): void {
  try {
    if (preference === "system") storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Persistence is best-effort; private browsing and blocked storage throw.
  }
}

export function applyThemeToDocument(
  preference: ThemePreference,
  prefersDark: boolean,
  root: ThemeRoot,
): ResolvedTheme {
  const resolved = resolveTheme(preference, prefersDark);
  root.classList.remove("dark", "light");
  if (preference === "dark") root.classList.add("dark");
  else if (preference === "light") root.classList.add("light");
  root.style.colorScheme = resolved;
  return resolved;
}
