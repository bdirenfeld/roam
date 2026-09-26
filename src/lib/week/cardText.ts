/**
 * Short lines for a place in the widened day (26 Sep 2026).
 */

/** The street part of a Google address: stops before the postal code, city or country. */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/\d{4,}/.test(p) || (out.length > 0 && !/\d/.test(p))) break;
    out.push(p);
    if (out.length === 2) break;
  }
  return out.join(", ") || parts[0] || "";
}

/** The first sentence of a card's notes. */
export function firstSentence(notes: string | null | undefined): string {
  const n = notes?.trim();
  if (!n) return "";
  const first = n.split(/\n/)[0];
  const m = first.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : first).trim();
}
