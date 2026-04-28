/** Eastern calendar day key so "random for the day" is stable across reloads until the next NY session date. */
function easternCalendarDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** One random seed per Eastern calendar day (persists across reloads via sessionStorage). */
export function getDailyFavoriteShuffleSeed(): number {
  const storageKey = `stockVisualizer:favoritesShuffle:${easternCalendarDateKey()}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing !== null) {
      const n = Number.parseInt(existing, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const n = Math.floor(Math.random() * 2 ** 31);
    sessionStorage.setItem(storageKey, String(n));
    return n;
  } catch {
    return Math.floor(Math.random() * 2 ** 31);
  }
}
