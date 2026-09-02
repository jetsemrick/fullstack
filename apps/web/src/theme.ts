export const THEME_STORAGE_KEY = "theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function parseStoredTheme(raw: string | null): ThemePreference {
  return isThemePreference(raw) ? raw : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function readStoredTheme(
  storage: Pick<Storage, "getItem">,
): ThemePreference {
  try {
    return parseStoredTheme(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeStoredTheme(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem">,
): void {
  storage.setItem(THEME_STORAGE_KEY, preference);
}

export function applyThemeToDocument(
  preference: ThemePreference,
  systemPrefersDark: boolean,
  root: { setAttribute: (name: string, value: string) => void; style: { colorScheme: string } },
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark);
  root.setAttribute("data-theme", preference);
  root.style.colorScheme = resolved;
  return resolved;
}
