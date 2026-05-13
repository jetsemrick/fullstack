import type { GetPricesResponse } from "@stock/shared";
import type { AlignedComparisonRow } from "./compareSeries";

function sanitizeTickerForCsvHeader(ticker: string): string {
  const s = ticker.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_*|_*$/g, "") || "symbol";
  return s;
}

/** One row per aligned timestamp; gaps use empty cells. */
function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildPricesCsv(data: GetPricesResponse): string {
  const lines: string[] = ["date,close,volume,currency,symbol"];
  for (const p of data.series) {
    const day = new Date(p.timestamp * 1000).toISOString().slice(0, 10);
    const close = String(p.close);
    const vol = p.volume == null ? "" : String(p.volume);
    const cur = data.currency ?? "";
    const sym = data.ticker;
    lines.push([day, close, vol, escapeField(cur), escapeField(sym)].join(","));
  }
  // BOM helps Excel on Windows interpret UTF-8
  return `\uFEFF${lines.join("\r\n")}`;
}

export type ComparisonCsvPayload = {
  rows: AlignedComparisonRow[];
  primaryTicker: string;
  secondaryTicker: string;
  primaryCurrency: string | null;
  secondaryCurrency: string | null;
};

export function buildComparisonPricesCsv(payload: ComparisonCsvPayload): string {
  const pc = sanitizeTickerForCsvHeader(payload.primaryTicker);
  const sc = sanitizeTickerForCsvHeader(payload.secondaryTicker);
  const headers = [
    "date",
    "timestamp_unix",
    `${pc}_close`,
    `${sc}_close`,
    "primary_currency",
    "compare_currency",
  ];
  const lines: string[] = [headers.join(",")];
  const pCur = escapeField(payload.primaryCurrency ?? "");
  const sCur = escapeField(payload.secondaryCurrency ?? "");
  for (const r of payload.rows) {
    const day = new Date(r.timestamp * 1000).toISOString().slice(0, 10);
    const pClose = r.primaryClose == null ? "" : String(r.primaryClose);
    const sClose = r.secondaryClose == null ? "" : String(r.secondaryClose);
    lines.push([day, String(r.timestamp), pClose, sClose, pCur, sCur].join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadComparisonPricesCsv(payload: ComparisonCsvPayload): void {
  const csv = buildComparisonPricesCsv(payload);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeP = payload.primaryTicker.replace(/[^A-Za-z0-9._-]+/g, "-");
  const safeS = payload.secondaryTicker.replace(/[^A-Za-z0-9._-]+/g, "-");
  a.href = url;
  a.download = `${safeP}-vs-${safeS}-prices.csv`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPricesCsv(data: GetPricesResponse): void {
  const csv = buildPricesCsv(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = data.ticker.replace(/[^A-Za-z0-9._-]+/g, "-");
  a.href = url;
  a.download = `${safe}-prices-by-day.csv`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
