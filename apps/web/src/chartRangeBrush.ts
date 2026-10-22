/** Map a horizontal pixel within the Recharts plot area to epoch ms on a linear time domain. */
export function chartXToMs(
  chartX: number,
  plotWidth: number,
  domainMinMs: number,
  domainMaxMs: number,
): number {
  if (plotWidth <= 0 || domainMaxMs <= domainMinMs) return domainMinMs;
  const ratio = Math.min(1, Math.max(0, chartX / plotWidth));
  return domainMinMs + ratio * (domainMaxMs - domainMinMs);
}

export function resolveXDomainMs(
  xDomain: [number, number] | [string, string],
  rows: { t: number }[],
): [number, number] {
  const dataMin = rows.length > 0 ? rows[0]!.t : 0;
  const dataMax = rows.length > 0 ? rows[rows.length - 1]!.t : dataMin;

  const lo = xDomain[0];
  const hi = xDomain[1];
  const minMs = typeof lo === "number" ? lo : dataMin;
  const maxMs = typeof hi === "number" ? hi : dataMax;
  return [minMs, maxMs];
}

export type ChartTimeRange = { startMs: number; endMs: number };

export function normalizeTimeRange(startMs: number, endMs: number): ChartTimeRange {
  return startMs <= endMs ? { startMs, endMs } : { startMs: endMs, endMs: startMs };
}
