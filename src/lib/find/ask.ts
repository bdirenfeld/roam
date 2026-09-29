/**
 * What Find asks, and how it reads the answer (29 Sep 2026). Pure, so the
 * route stays a thin wrapper round two network calls.
 */

import { FIND_CATEGORIES } from "./gaps";

/** Words for a Google text search, by Roam sub-type. */
const GOOGLE_WORDS: Record<string, string> = {
  self_directed: "things to do",
  restaurant: "restaurants",
  coffee: "coffee shop",
  dessert: "dessert gelato bakery",
  guided: "tours",
  bar: "cocktail bar",
  shopping: "shops",
};

export function googleQuery(subType: string, base: string, ask: string | null): string {
  if (ask && ask.trim()) return `${ask.trim()} in ${base}`;
  return `${GOOGLE_WORDS[subType] ?? "things to do"} in ${base}`;
}

export function travellersPrompt(opts: {
  base: string; country: string | null; subType: string; ask: string | null;
  party: number; childAges: number[]; month: string;
}): string {
  const label = FIND_CATEGORIES.find((c) => c.subType === opts.subType)?.label ?? "Places";
  const who = opts.childAges.length
    ? `a family of ${opts.party} with children aged ${opts.childAges.join(", ")}`
    : `${opts.party} adult${opts.party === 1 ? "" : "s"}`;
  const what = opts.ask && opts.ask.trim() ? opts.ask.trim() : `${label.toLowerCase()} (Roam's category "${label}")`;
  return `Find ${what} in ${opts.base}${opts.country ? `, ${opts.country}` : ""} for ${who}, visiting in ${opts.month}.
Search Reddit threads and travel blogs for places travellers who went recommend, not listicles of the obvious.
Name up to 6 specific places (a named restaurant, café, sight or shop, never a neighbourhood or a chain in general).
Reply with JSON only:
{"places":[{"name":string,"near":string,"why":string,"source_name":string,"source_url":string,"kids":boolean}]}
"why" is one plain sentence under 16 words saying what is good about it. "kids" is true when it suits children.
"source_url" must be a page you actually read.`;
}

export interface TravellerPick { name: string; near: string | null; why: string; sourceName: string | null; sourceUrl: string | null; kids: boolean }

export function parseTravellers(text: string): TravellerPick[] {
  const t = text.trim();
  const candidates = [t, t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], t.match(/\{[\s\S]*\}/)?.[0]];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const j = JSON.parse(c.trim()) as { places?: unknown };
      if (!Array.isArray(j.places)) continue;
      return (j.places as Record<string, unknown>[])
        .map((p) => ({
          name: typeof p.name === "string" ? p.name.trim().slice(0, 120) : "",
          near: typeof p.near === "string" ? p.near.trim().slice(0, 80) : null,
          why: typeof p.why === "string" ? p.why.trim().slice(0, 160) : "",
          sourceName: typeof p.source_name === "string" ? p.source_name.trim().slice(0, 60) : null,
          sourceUrl: typeof p.source_url === "string" && /^https?:\/\//.test(p.source_url) ? p.source_url : null,
          kids: p.kids === true,
        }))
        .filter((p) => p.name.length > 1)
        .slice(0, 6);
    } catch { /* next */ }
  }
  return [];
}
