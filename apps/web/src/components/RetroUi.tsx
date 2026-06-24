import type { ComponentPropsWithoutRef, FormEvent, ReactNode } from "react";

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type RetroCardProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

export function RetroCard({ className, children, ...props }: RetroCardProps) {
  return (
    <div {...props} className={classNames("card", className)}>
      {children}
    </div>
  );
}

type RetroSearchFormProps = {
  formId: string;
  value: string;
  disabled: boolean;
  placeholderTicker: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RetroSearchForm({
  formId,
  value,
  disabled,
  placeholderTicker,
  onChange,
  onSubmit,
}: RetroSearchFormProps) {
  return (
    <form className="search-form" onSubmit={onSubmit} aria-labelledby={`${formId}-legend`}>
      <label id={`${formId}-legend`} htmlFor={`${formId}-ticker`} className="sr-only">
        Ticker
      </label>
      <div className="search-input-wrapper">
        <input
          id={`${formId}-ticker`}
          name="ticker"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="search-input"
          placeholder={`e.g. ${placeholderTicker}`}
          maxLength={32}
        />
        <button id={`${formId}-submit`} type="submit" className="search-btn" disabled={disabled}>
          Search
        </button>
      </div>
    </form>
  );
}

type MetricTone = "default" | "positive" | "negative" | "muted";

export function RetroMetricBadge({ children, tone = "default" }: { children: ReactNode; tone?: MetricTone }) {
  return <span className={classNames("metric-badge", tone !== "default" && tone)}>{children}</span>;
}

type RetroSegmentedControlProps = {
  items: Array<{ label: string }>;
  activeIndex: number;
  ariaLabel: string;
  onSelect: (index: number) => void;
};

export function RetroSegmentedControl({ items, activeIndex, ariaLabel, onSelect }: RetroSegmentedControlProps) {
  return (
    <div className="horizon-buttons" role="group" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          className={classNames("horizon-btn", index === activeIndex && "active")}
          aria-pressed={index === activeIndex}
          onClick={() => onSelect(index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function LoadingChartCard() {
  return (
    <RetroCard className="loading-card" aria-busy="true" aria-label="Loading chart">
      <div className="skeleton-toolbar" />
      <div className="skeleton-chart" />
    </RetroCard>
  );
}

export function ErrorBanner({ error }: { error: string }) {
  return (
    <RetroCard className="error-banner" role="alert">
      <strong>Could not load data.</strong> {error}
    </RetroCard>
  );
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-export" onClick={onClick} title="Export CSV">
      Export CSV
    </button>
  );
}
