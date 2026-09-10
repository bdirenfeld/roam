// ── What has to be there ──────────────────────────────────────────────────
// Brennan, 10 Sept 2026: "what if a pool needed to be mandatory and playground
// nearby was a nice to have?"
//
// One free-text line, no form and no classifying. Anything in it the listing
// can actually answer becomes a must-have; the rest goes into the search text
// as flavour. The point is the three states, not two: a pool is confirmed,
// confirmed absent, or simply not listed — and only the middle one is dropped.
// Treating "not listed" as a failure would have emptied the Tuscany list,
// where no row carries amenities at all.

export type WantKey = "pool" | "ac";

/** What the listing says about this want. */
export type WantVerdict = "yes" | "no" | "unknown";

export interface Amenities {
  pool: boolean | null;
  ac: boolean | null;
}

const WORDS: { key: WantKey; test: RegExp; noun: string }[] = [
  { key: "pool", test: /\bpools?\b|\bswimming\b/i, noun: "Pool" },
  { key: "ac", test: /\ba\/?c\b|\bair.?con(ditioning)?\b/i, noun: "AC" },
];

/** The must-haves we can check, in the order they were typed. */
export function parseWants(text: string | null | undefined): WantKey[] {
  if (!text) return [];
  const out: WantKey[] = [];
  for (const w of WORDS) if (w.test.test(text) && !out.includes(w.key)) out.push(w.key);
  return out;
}

export function wantVerdict(want: WantKey, a: Amenities): WantVerdict {
  const v = want === "pool" ? a.pool : a.ac;
  return v == null ? "unknown" : v ? "yes" : "no";
}

/** True when the listing positively says this one is missing. Only these are dropped. */
export function failsWants(wants: WantKey[], a: Amenities): boolean {
  return wants.some((w) => wantVerdict(w, a) === "no");
}

/**
 * The note on a row we kept but could not verify, so a blank is never mistaken
 * for a yes. The link out opens the site on these dates, so checking is a tap.
 */
export function wantsNote(wants: WantKey[], a: Amenities): string | null {
  const unknown = wants.filter((w) => wantVerdict(w, a) === "unknown");
  if (!unknown.length) return null;
  const nouns = unknown.map((w) => WORDS.find((x) => x.key === w)!.noun);
  return `${nouns.join(" and ")} not listed`;
}

/** The typed line, folded into the search text so the results lean the right way. */
export function wantsQuery(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}
