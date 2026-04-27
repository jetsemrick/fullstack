import type { GetPricesResponse } from "@stock/shared";

/** One row per series point, date as ISO calendar day (UTC). */
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
