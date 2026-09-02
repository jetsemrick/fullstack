import { useEffect, useState } from "react";
import {
  applyThemeToDocument,
  parseStoredTheme,
  writeStoredTheme,
  type ThemePreference,
} from "./theme";

function readDocumentPreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  return parseStoredTheme(document.documentElement.getAttribute("data-theme"));
}

export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => void,
] {
  const [preference, setPreference] = useState<ThemePreference>(readDocumentPreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      applyThemeToDocument(preference, media.matches, document.documentElement);
    };
    apply();
    writeStoredTheme(preference, localStorage);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  return [preference, setPreference];
}
