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

/**
 * The day row's "street, town" (moved from CardSurface, 4 Oct 2026). Italian
 * addresses put the number after a comma, and Florence's carry an "r" (red,
 * shop numbering): "Via Isola delle Stinche, 7r, 50122 Firenze FI" printed as
 * "Via Isola delle Stinche, r", the postcode-stripper eating the 7. A part that
 * is only a street number now joins the street, and the town comes after it.
 */
export function streetAndTown(a?: string | null): string | null {
  if (!a) return null;
  const parts = a.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  let street = parts[0];
  let i = 1;
  if (parts[1] && /^\d+\s?[a-zA-Z]?(\/\w+)?$/.test(parts[1])) { street = `${street}, ${parts[1]}`; i = 2; }
  const city = parts[i]
    ?.replace(/^\d[\d\s-]*/, "")        // leading postcode
    .replace(/\s+[A-Z]{2}$/, "")        // trailing province code
    .trim();
  return city ? `${street}, ${city}` : street;
}

/** The first sentence of a card's notes. */
export function firstSentence(notes: string | null | undefined): string {
  const n = notes?.trim();
  if (!n) return "";
  const first = n.split(/\n/)[0];
  const m = first.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : first).trim();
}
