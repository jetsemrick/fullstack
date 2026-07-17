import { DEFAULT_TICKER } from "./constants";

export function normalizeTicker(raw: string | null | undefined): string {
  const ticker = raw?.trim();
  return ticker ? ticker.toUpperCase() : DEFAULT_TICKER;
}
