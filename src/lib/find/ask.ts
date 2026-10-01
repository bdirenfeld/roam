/**
 * What Find asks, and how it reads the answer (29 Sep 2026). Pure, so the
 * route stays a thin wrapper round two network calls.
 */

import { FIND_CATEGORIES } from "./gaps";
import { NEAR_PLAN as NEAR_KINDS } from "./near";

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
  // "beaches in Tamarindo" gives Google's one Tamarindo Beach and nothing else,
  // for any town with a beach of its name; "best beaches near" gives twenty
  // (Costa Rica test, 29 Sep 2026).
  if (subType === "beach") return `best beaches near ${base}`;
  return `${GOOGLE_WORDS[subType] ?? "things to do"} in ${base}`;
}

/**
 * Kinds that happen on dates, not at addresses: Google can only name venues
 * (a stadium for "Race", a club for "Event"), which is not what a person
 * wants (Brennan, 29 Sep 2026). For these Find asks only what is on in the
 * city during the journey's own dates, and skips Google.
 */
export const DATED = new Set(["event", "challenge", "camp"]);

/**
 * What each category is, in words the search cannot misread (30 Sep 2026).
 * Asked only for "tour", Tuscany's travellers' picks were the city walls, two
 * towers, a trattoria and a bike shop; "wellness" brought an adventure park.
 */
const TRAVELLER_WORDS: Record<string, string> = {
  self_directed: "sights and places to explore on your own: landmarks, museums, old towns, parks, viewpoints",
  guided: "tours, classes and experiences you book with a guide or teacher: walking, bike and food tours, cooking classes, boat trips (never a sight on its own, a restaurant or a shop)",
  restaurant: "restaurants for a proper lunch or dinner",
  coffee: "cafés and coffee bars",
  dessert: "gelato, pastry, bakery and dessert shops",
  bar: "bars, wine bars and cocktail bars (not cafés or restaurants)",
  wellness: "spas, massage, thermal baths and hot springs (not gyms or adventure parks)",
  beach: "beaches and beach clubs",
};
const DATED_WORDS: Record<string, string> = {
  event: "festivals, concerts, shows, markets and other events",
  challenge: "running races and other organised races or rides",
  camp: "day camps and holiday programmes a visiting child can join by the day or the week, each a specific named camp (never a scheme, a directory, a school or a festival)",
};

export function travellersPrompt(opts: {
  base: string; country: string | null; subType: string; ask: string | null;
  party: number; childAges: number[]; month: string;
  /** Children on the trip whose ages are not saved (a party of three or more, as Plan my trip assumes). */
  kids?: boolean;
  /** Anyone 65 or over on the trip (lib/party). */
  seniors?: boolean;
  /** The journey's dates, for the dated kinds. */
  from?: string; to?: string;
  /** Sights the days are built around, for coffee and dessert near them. */
  near?: string[];
}): string {
  const label = FIND_CATEGORIES.find((c) => c.subType === opts.subType)?.label ?? "Places";
  const who = opts.childAges.length
    ? `a family of ${opts.party} with children aged ${opts.childAges.join(", ")}`
    : opts.kids ? `a family of ${opts.party} with children`
    : `${opts.party} adult${opts.party === 1 ? "" : "s"}`;
  const whoAll = opts.seniors ? `${who}, including someone over 65 (favour easy access: little walking, few stairs)` : who;
  const what = opts.ask && opts.ask.trim() ? opts.ask.trim() : `${TRAVELLER_WORDS[opts.subType] ?? label.toLowerCase()} (Roam's category "${label}")`;
  const where = `${opts.base}${opts.country ? `, ${opts.country}` : ""}`;
  if (DATED.has(opts.subType) && !(opts.ask && opts.ask.trim()) && opts.from && opts.to) {
    // Events reach a day trip away and lead with what is special to those
    // dates: Tuscany's Bravio delle Botti, the barrel race in Montepulciano two
    // hours from the villa, is the thing to plan a day around (Brennan, 30 Sep 2026).
    const reach = opts.subType === "event" ? `in or within about two hours' drive of ${where}` : `in ${where}`;
    const lead = opts.subType === "event"
      ? `\nLead with what makes these dates special here: traditional festivals, palios and historic races, village food
festivals, feast-day processions and re-enactments, the kind a visitor would plan a day around and could only see
on these dates. The region's best-known ones first, even two hours away, then nearer ones. Then the best concerts,
shows and markets.`
      : "";
    return `Find ${DATED_WORDS[opts.subType]} happening ${reach} between ${opts.from} and ${opts.to}, for ${whoAll}.${lead}
Search event listings, official city, regional and tourism sites, race calendars and local news for that year. Only include
things that take place on at least one of those dates; never a venue with nothing on. If that year's programme is not
published yet, include events held every year on those dates (a fixed day, or a rule like "the last Sunday of August")
and start "why" with "Usually" and the day.
The journey's days, with their weekdays: ${tripCalendar(opts.from, opts.to)}. Give dates for that year, and work out a
rule like "the second Sunday of April" from this calendar, not from another year's.${opts.childAges.length || opts.kids ? `
Children are on this trip: leave out adult-themed events (sexual themes, nightlife, drinking festivals).` : ""}
Name up to 8. For each, "name" is the venue or starting point Google Maps would know, "near" is the neighbourhood.
Reply with JSON only:
{"places":[{"name":string,"near":string,"why":string,"source_name":string,"source_url":string,"kids":boolean}]}
"why" starts with the date or dates (e.g. "Sat 25 Apr: ..." or "Usually Sun 29 Aug: ...") and says in under 16 words what it is.
"kids" is true when it suits children. "source_url" must be a page you actually read.`;
  }
  const nearLine = opts.near && opts.near.length && NEAR_KINDS.has(opts.subType)
    ? `\nThe days are spent around ${opts.near.join(", ")}: only recommend places a short walk from one of those.`
    : "";
  return `Find ${what} in ${opts.base}${opts.country ? `, ${opts.country}` : ""} for ${whoAll}, visiting in ${opts.month}.
Search Reddit threads and travel blogs for what travellers who went recommend.${nearLine}
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
  const tidy = (places: Record<string, unknown>[]): TravellerPick[] => places
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
  for (const c of candidates) {
    if (!c) continue;
    try {
      const j = JSON.parse(c.trim()) as { places?: unknown };
      if (!Array.isArray(j.places)) continue;
      return tidy(j.places as Record<string, unknown>[]);
    } catch { /* next */ }
  }
  // An answer cut off mid-list (Tokyo's events hit the length limit, 30 Sep
  // 2026): keep every place that came through whole.
  const whole: Record<string, unknown>[] = [];
  const at = t.indexOf('"places"');
  if (at >= 0) {
    for (const m of Array.from(t.slice(at).matchAll(/\{[^{}]*\}/g))) {
      try { whole.push(JSON.parse(m[0]) as Record<string, unknown>); } catch { /* a broken one */ }
    }
  }
  return tidy(whole);
}

/**
 * The shared cache's key (29 Sep 2026): the same base, category, question
 * and kind of party gets the same answer for 30 days, whoever asks. Places
 * are public; what is already on someone's journey is filtered after.
 * The base is rounded to about a kilometre so two journeys to one city share.
 */
export function cacheKey(opts: { mode: "google" | "travellers"; lat: number; lng: number; subType: string; ask: string | null; kids: boolean; near?: { lat: number; lng: number }[]; when?: string | null }): string {
  const q = (opts.ask ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const near = (opts.near ?? []).map((p) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`).join(";");
  // The travellers' answers carry the prompt's version: a better question must
  // not be answered from last week's cache (FIND_PROMPT_V).
  const mode = opts.mode === "travellers" ? `travellers${FIND_PROMPT_V}` : opts.mode;
  return [mode, opts.lat.toFixed(2), opts.lng.toFixed(2), opts.subType, q, opts.kids ? "kids" : "adults", near, opts.when ?? ""].join("|");
}
export const CACHE_DAYS = 30;
/** Bump when the travellers' prompt changes, so cached answers are asked again. */
export const FIND_PROMPT_V = "v2";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/**
 * Whether an event's "why" falls on the journey's dates. The search is told
 * to keep to them and sometimes does not: Tuscany's answer carried the
 * Luminara di Santa Croce, 13 September, for a trip ending on the 4th
 * (30 Sep 2026). Every "13 Sep"-style date in the text is read against the
 * trip's year(s); one inside keeps it, all outside drop it, none found keeps it.
 */
export function onTripDates(why: string, from: string, to: string): boolean {
  const found = Array.from(why.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi));
  if (!found.length) return true;
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  const years = new Set([new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear()]);
  return found.some((m) => {
    const month = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3));
    return Array.from(years).some((y) => { const t = Date.UTC(y, month, Number(m[1])); return t >= a && t <= b; });
  });
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * The journey's days with their weekdays, for the events search. Japan's
 * answer said "Sun 13 Apr" for April 2028, when the 13th is a Thursday: the
 * weekdays came from another year (30 Sep 2026).
 */
export function tripCalendar(from: string, to: string): string {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  const out: string[] = [];
  for (let t = a; t <= b && out.length < 40; t += 86_400_000) {
    const d = new Date(t);
    out.push(`${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`);
  }
  return `${out.join(", ")} (${new Date(a).getUTCFullYear()})`;
}

/**
 * A weekday that does not match its date on the journey is corrected: "Sun 13
 * Apr" on a 2028 trip reads "Thu 13 Apr". Dates outside the journey are left
 * for onTripDates to judge.
 */
export function fixWeekdays(why: string, from: string, to: string): string {
  const a = Date.parse(from + "T00:00:00Z"), b = Date.parse(to + "T00:00:00Z");
  const years = Array.from(new Set([new Date(a).getUTCFullYear(), new Date(b).getUTCFullYear()]));
  // A rule named in the text ("2nd Sun of Apr") gives the real date that year.
  const rule = why.match(/\b(1st|first|2nd|second|3rd|third|4th|fourth|last)\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\s+(?:of|in)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (rule) {
    const ORD: Record<string, number> = { "1st": 0, first: 0, "2nd": 1, second: 1, "3rd": 2, third: 2, "4th": 3, fourth: 3, last: -1 };
    const n = ORD[rule[1].toLowerCase()];
    const wd = DAYS.findIndex((d) => d.toLowerCase() === rule[2].slice(0, 3).toLowerCase());
    const m = MON.findIndex((x) => x.toLowerCase() === rule[3].slice(0, 3).toLowerCase());
    for (const y of years) {
      const t = nthWeekday(y, m, wd, n);
      if (t >= a && t <= b) {
        const d = new Date(t);
        return why.replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\.?\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/, `${DAYS[wd]} ${d.getUTCDate()} ${MON[m]}`);
      }
    }
  }
  return why.replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\.?\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)([a-z]*)/g, (all, _wd, day, mon, rest) => {
    const m = MON.indexOf(mon);
    for (const y of years) {
      const t = Date.UTC(y, m, Number(day));
      if (t >= a && t <= b) return `${DAYS[new Date(t).getUTCDay()]} ${day} ${mon}${rest}`;
    }
    return all;
  });
}

/** The nth weekday of a month (n = -1: the last), as a UTC time. */
function nthWeekday(y: number, m: number, wd: number, n: number): number {
  if (n < 0) {
    const last = new Date(Date.UTC(y, m + 1, 0));
    return Date.UTC(y, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
  }
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return Date.UTC(y, m, 1 + ((wd - first + 7) % 7) + 7 * n);
}
