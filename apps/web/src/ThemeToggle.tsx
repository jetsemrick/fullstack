import { useTheme, type ThemePreference } from "./useTheme";

const CYCLE_ORDER: ThemePreference[] = ["light", "dark", "system"];

function getLabel(preference: ThemePreference): string {
  switch (preference) {
    case "light":
      return "Light";
    case "dark":
      return "Dark";
    case "system":
      return "Auto";
  }
}

function getIcon(preference: ThemePreference, resolvedTheme: "light" | "dark"): string {
  if (preference === "system") {
    return resolvedTheme === "dark" ? "\u25D0" : "\u25D0";
  }
  return preference === "dark" ? "\u263D" : "\u2600";
}

export function ThemeToggle() {
  const { theme, preference, setTheme } = useTheme();

  function handleClick() {
    const currentIndex = CYCLE_ORDER.indexOf(preference);
    const nextIndex = (currentIndex + 1) % CYCLE_ORDER.length;
    setTheme(CYCLE_ORDER[nextIndex]);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={`Theme: ${getLabel(preference)}. Click to change.`}
      title={`Current: ${getLabel(preference)}`}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {getIcon(preference, theme)}
      </span>
      <span className="theme-toggle__label">{getLabel(preference)}</span>
    </button>
  );
}
