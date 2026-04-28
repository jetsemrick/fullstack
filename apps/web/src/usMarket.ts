const EASTERN = "America/New_York";

/** Calendar components (year, month, day) as numbers in Eastern for an instant */
function easternCalendarParts(ms: number): { y: number; mo: number; dy: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(new Date(ms));
  return {
    y: +(parts.find((p) => p.type === "year")?.value ?? 0),
    mo: +(parts.find((p) => p.type === "month")?.value ?? 0),
    dy: +(parts.find((p) => p.type === "day")?.value ?? 0),
  };
}

/** 24-hour hour + minute on that clock in Eastern. */
function easternClockParts(ms: number): { hr: number; min: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(ms));
  return {
    hr: +(parts.find((p) => p.type === "hour")?.value ?? 0),
    min: +(parts.find((p) => p.type === "minute")?.value ?? 0),
  };
}

/** UTC epoch ms where Eastern wall-clock reads `hour24Et:minuteEt` on the given Eastern calendar day. Scans ±40h — fine-grained DST-safe. */
function easternWallUtcMs(
  easternY: number,
  easternMo: number,
  easternDy: number,
  hour24Et: number,
  minuteEt: number,
): number | undefined {
  const anchor = Date.UTC(easternY, easternMo - 1, easternDy, 17, 0, 0, 0);
  const span = 40 * 60 * 60 * 1000;
  const step = 60 * 1000;
  const lo = anchor - span;
  const hi = anchor + span;
  for (let ms = lo; ms <= hi; ms += step) {
    const cal = easternCalendarParts(ms);
    if (cal.y !== easternY || cal.mo !== easternMo || cal.dy !== easternDy) continue;
    const c = easternClockParts(ms);
    if (c.hr === hour24Et && c.min === minuteEt) return ms;
  }
  return undefined;
}

/**
 * Regular session (RTH) 9:30–16:00 Eastern for the trading day of `anchorUtcMs`
 * (used for US-listed charts so the intraday x-axis shows the whole session).
 */
export function regularSessionDomainUtcMs(anchorUtcMs: number): [number, number] | undefined {
  const { y: ey, mo: emo, dy: edy } = easternCalendarParts(anchorUtcMs);
  const open = easternWallUtcMs(ey, emo, edy, 9, 30);
  const close = easternWallUtcMs(ey, emo, edy, 16, 0);
  if (open === undefined || close === undefined) return undefined;
  return [open, close];
}

const RTH_HOURLY_SLOTS: readonly [number, number][] = [
  [10, 0],
  [11, 0],
  [12, 0],
  [13, 0],
  [14, 0],
  [15, 0],
  [16, 0],
];

/** Explicit hourly x-axis ticks at the top of each hour during RTH (10:00–16:00 Eastern). */
export function hourlySessionTicksUtcMs(openMs: number, closeMs: number): number[] {
  const { y, mo, dy } = easternCalendarParts(openMs);
  const out: number[] = [];
  for (const [h, minute] of RTH_HOURLY_SLOTS) {
    const t = easternWallUtcMs(y, mo, dy, h, minute);
    if (t !== undefined && t >= openMs && t <= closeMs) out.push(t);
  }
  return out.sort((a, b) => a - b);
}
