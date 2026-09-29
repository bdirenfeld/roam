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
  guided: "tours and classes",
  bar: "cocktail bar",
  challenge: "running races",
  wellness: "spa and massage",
  event: "live shows and events",
  beach: "beaches",
  camp: "kids day camps",
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
Search Reddit threads and travel blogs for what travellers who went recommend.
${opts.subType === "self_directed" && !(opts.ask && opts.ask.trim())
    ? `Start with the places a first visit should not miss, then add ones travellers loved that first-timers usually skip.`
    : `Favour places travellers who went praise over the ones every listicle repeats.`}
Name up to 8 specific places (a named restaurant, café, sight or shop, never a neighbourhood or a chain in general).
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
        .slice(0, 8);
    } catch { /* next */ }
  }
  return [];
}

/**
 * The shared cache's key (29 Sep 2026): the same base, category, question
 * and kind of party gets the same answer for 30 days, whoever asks. Places
 * are public; what is already on someone's journey is filtered after.
 * The base is rounded to about a kilometre so two journeys to one city share.
 */
export function cacheKey(opts: { mode: "google" | "travellers"; lat: number; lng: number; subType: string; ask: string | null; kids: boolean }): string {
  const q = (opts.ask ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [opts.mode, opts.lat.toFixed(2), opts.lng.toFixed(2), opts.subType, q, opts.kids ? "kids" : "adults"].join("|");
}
export const CACHE_DAYS = 30;
