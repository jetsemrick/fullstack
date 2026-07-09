import type { ThemePreference } from "./theme";

const OPTIONS: { value: ThemePreference; label: string; title: string }[] = [
  { value: "light", label: "Light", title: "Light theme" },
  { value: "dark", label: "Dark", title: "Dark theme" },
  { value: "system", label: "System", title: "Match system preference" },
];

type ThemeToggleProps = {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
};

export function ThemeToggle({ preference, onChange }: ThemeToggleProps) {
  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`theme-toggle__btn ${preference === option.value ? "active" : ""}`}
          title={option.title}
          aria-pressed={preference === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
