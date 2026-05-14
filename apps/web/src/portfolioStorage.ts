import type { PortfolioHoldingInput } from "./portfolioMath";

const STORAGE_KEY = "stock-visualizer-portfolio-v1";

export interface StoredHolding extends PortfolioHoldingInput {
  id: string;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseHoldings(raw: unknown): StoredHolding[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredHolding[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : randomId();
    const ticker = typeof o.ticker === "string" ? o.ticker.trim().toUpperCase() : "";
    const shares = typeof o.shares === "number" ? o.shares : Number(o.shares);
    let averageCostPerShare: number | null = null;
    if (o.averageCostPerShare != null && o.averageCostPerShare !== "") {
      const c = typeof o.averageCostPerShare === "number" ? o.averageCostPerShare : Number(o.averageCostPerShare);
      if (Number.isFinite(c) && c >= 0) averageCostPerShare = c;
    }
    if (!ticker || !Number.isFinite(shares) || shares <= 0) continue;
    out.push({ id, ticker, shares, averageCostPerShare });
  }
  return out;
}

export function loadPortfolioFromStorage(): StoredHolding[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return [];
    const json: unknown = JSON.parse(s);
    return parseHoldings(json);
  } catch {
    return [];
  }
}

export function savePortfolioToStorage(holdings: StoredHolding[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Rows with a non-empty ticker and positive share count are persisted. */
export function persistableHoldings(holdings: StoredHolding[]): StoredHolding[] {
  return holdings.filter((h) => {
    const t = h.ticker.trim();
    return t.length > 0 && Number.isFinite(h.shares) && h.shares > 0;
  });
}

export function newHoldingRow(): StoredHolding {
  return { id: randomId(), ticker: "", shares: 1, averageCostPerShare: null };
}
