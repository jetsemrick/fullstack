export type TextSegment = { text: string; match: boolean };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits `text` into runs, marking case-insensitive occurrences of any word in `query`. */
export function splitMatches(text: string, query: string): TextSegment[] {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (words.length === 0 || !text) return text ? [{ text, match: false }] : [];
  const re = new RegExp(`(${words.join("|")})`, "gi");
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), match: false });
    out.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out;
}

