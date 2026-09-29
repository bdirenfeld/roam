/**
 * Day-sized groups of a journey's pins (28 Sep 2026, the "Plan my trip"
 * proof). Roam sorts the saved places into groups that make one day each:
 * close together, open on a common weekday, about a day's worth of doing.
 * The person drags a group onto a day (or asks for all of them to be placed);
 * the day planner (lib/week) gives the times.
 *
 * Rules, not a model — deterministic, the same every time:
 * - Regions: pins within REGION_KM of each other chain into one region
 *   (Tokyo and Kamakura, Kyoto and Osaka; Izu apart from both).
 * - Load: what a place costs of a day. A theme park, a zoo, a national park,
 *   a town, an island or a gorge is the whole day; a shop or a massage a
 *   quarter; anything else half. Two whole-day places on one site (Super
 *   Nintendo World inside Universal Studios) count once.
 * - Groups: the closest groups merge while the result fits one day (load 1,
 *   MAX_ITEMS places, SPAN_KM across, one weekday everything is open).
 * - Meals and coffee take no day time: each joins the nearest group with a
 *   free slot open that day; the rest are spare options, not extra days.
 * - Bars on a journey with children, and anything with no location, are left
 *   for the person to place.
 */

export interface Pin {
  id: string;
  title: string;
  type: "activity" | "food" | "logistics";
  subType: string | null;
  lat: number | null;
  lng: number | null;
  /** Monday-first, "1" open / "0" closed; null when the hours are unknown. */
  open?: string | null;
  /** Google place types, when saved. */
  types?: string[] | null;
  address?: string | null;
}

export interface DayGroup {
  region: number;
  items: Pin[];
  meals: Pin[];
  /** Share of a day the items take, 0–1. */
  load: number;
  /** Monday-first weekdays everything in the group is open. */
  openDays: string;
  centre: { lat: number; lng: number };
}

export interface Region {
  id: number;
  centre: { lat: number; lng: number };
  /** Days the region's groups make. */
  days: number;
  pins: number;
}

export interface Grouping {
  regions: Region[];
  groups: DayGroup[];
  /** Days the groups need, with half a day for each move between regions. */
  daysNeeded: number;
  /** Meals no group had room for: options, not days. */
  spareMeals: Pin[];
  left: { pin: Pin; reason: string }[];
}

/**
 * A region is a base: where you sleep. One number with Where to stay
 * (lib/stays/brief), so the two agree on where you are each night (29 Sep
 * 2026) — Lucca and Florence (60 km) are one villa with a day trip; Tokyo
 * and Osaka are two bases.
 */
export { REGION_KM } from "@/lib/stays/brief";
import { REGION_KM } from "@/lib/stays/brief";
/**
 * A day everything in is a short walk apart can hold more: Brennan's own
 * full city days ran about seven hours (Sydney day 2: the Opera House, the
 * Rocks, Barangaroo and a playground, all within 2.5 km).
 */
export const WALKABLE_KM = 2.5;
const WALKABLE_LOAD = 1.25;
/** Moving between regions costs half a day. */
export const MOVE_DAYS = 0.5;
/** Widest a day may spread. */
export const SPAN_KM = 15;
const MEAL_KM = 3;
/** Places this close are a walk apart: the second costs half. */
const WALK_KM = 1;
/** A pinned town's day covers what is inside it (Kamakura and its beach). */
const TOWN_KM = 5;

// What a place costs of a day comes from Google's place types first; the
// name is read only for general words, never for particular places (29 Sep
// 2026, Brennan: "we can't just make these one-offs"). The chains are theme
// parks that are the same everywhere, not places on one journey.
const WHOLE_TYPES = ["amusement_park", "zoo", "aquarium", "locality", "national_park"];
const WHOLE_NAME = /\b(theme park|amusement park|water ?park|safari|national park|wildlife park|island|gorge|canyon|day trip|excursion|wine tour|food tour)\b|\b(disney(land|sea|world)?|universal studios|legoland|six flags|seaworld|europa-park|portaventura)\b/i;
const SMALL_TYPES = ["store", "shopping_mall", "clothing_store", "book_store", "department_store", "jewelry_store", "home_goods_store", "shoe_store", "spa", "beauty_salon"];
const SMALL_NAME = /\b(shop|store|boutique|stationery|stationer|market|mall|outlet|toys?|massage|spa|wellness)\b/i;
/** Errands fit around a day the way a coffee does; they never make one. */
const ERRAND_TYPES = ["pharmacy", "supermarket", "grocery_or_supermarket", "convenience_store"];
const ERRAND_NAME = /\b(pharmacy|chemist|drugstore|farmacia|pharmacie|apotheke|supermarket|supermercato|supermarché|grocery|convenience store)\b/i;
export const isErrand = (p: Pin) =>
  p.type === "activity" && ((p.types ?? []).some((t) => ERRAND_TYPES.includes(t)) || ERRAND_NAME.test(p.title));
const NOT_A_VISIT = ["taxi_stand", "travel_agency_office"];
const NOT_A_VISIT_NAME = /\btaxi\b/i;
/** Evening things join a day the way dinner does: a night walk, a night market, golden hour. */
const EVENING_NAME = /night walk|night market|golden hour|sunset|evening|aperitivo/i;
export const isEvening = (p: Pin) => p.type === "activity" && EVENING_NAME.test(p.title);

/** Share of a day a place takes. */
export function dayShare(p: Pin): number {
  if (p.type !== "activity" || isEvening(p) || isErrand(p)) return 0;
  const types = p.types ?? [];
  if (types.some((t) => WHOLE_TYPES.includes(t)) || WHOLE_NAME.test(p.title)) return 1;
  if (p.subType === "wellness" || p.subType === "shopping" || types.some((t) => SMALL_TYPES.includes(t)) || SMALL_NAME.test(p.title)) return 0.25;
  return 0.5;
}

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ALL_OPEN = "1111111";
function openOf(p: Pin): string {
  return p.open && /^[01]{7}$/.test(p.open) ? p.open : ALL_OPEN;
}
function andDays(a: string, b: string): string {
  let out = "";
  for (let i = 0; i < 7; i++) out += a[i] === "1" && b[i] === "1" ? "1" : "0";
  return out;
}
const located = (p: Pin): p is Pin & { lat: number; lng: number } => p.lat !== null && p.lng !== null;
const centreOf = (ps: { lat: number; lng: number }[]) => ({
  lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
  lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
});

/**
 * Load of a set of places. Shares add, except: two whole-day places on one
 * site count once; anything inside a pinned town is part of that town's day;
 * a place a short walk from one already counted costs half.
 */
export function loadOf(items: Pin[]): number {
  const here = items.filter(located) as (Pin & { lat: number; lng: number })[];
  const whole = here.filter((p) => dayShare(p) === 1);
  const towns = whole.filter((p) => (p.types ?? []).includes("locality"));
  let load = 0;
  whole.forEach((p, i) => { if (!whole.slice(0, i).some((q) => km(p, q) < 0.6)) load += 1; });
  const counted: (Pin & { lat: number; lng: number })[] = [...whole];
  for (const p of here.filter((q) => dayShare(q) < 1)) {
    if (towns.some((t) => km(t, p) <= TOWN_KM)) continue;
    load += counted.some((q) => km(p, q) <= WALK_KM) ? dayShare(p) / 2 : dayShare(p);
    counted.push(p);
  }
  return load;
}

export function groupPins(pins: Pin[], opts: { kids: boolean }): Grouping {
  const maxItems = opts.kids ? 3 : 4;
  const fits = (items: (Pin & { lat: number; lng: number })[]) => {
    let far = 0;
    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) far = Math.max(far, km(items[a], items[b]));
    const walkable = far <= WALKABLE_KM;
    return items.length <= maxItems + (walkable ? 1 : 0) && loadOf(items) <= (walkable ? WALKABLE_LOAD : 1);
  };
  const left: Grouping["left"] = [];
  const acts: (Pin & { lat: number; lng: number })[] = [];
  const meals: (Pin & { lat: number; lng: number })[] = [];
  const seen = new Set<string>();
  for (const p of pins) {
    const key = `${p.title}|${p.lat}|${p.lng}`;
    if (seen.has(key)) { if (p.type !== "logistics") left.push({ pin: p, reason: "Saved twice" }); continue; }
    seen.add(key);
    if (p.type === "logistics") continue;
    if (!located(p)) { left.push({ pin: p, reason: "No location" }); continue; }
    if (p.type === "food") {
      if (p.subType === "bar" && opts.kids) { left.push({ pin: p, reason: "A bar, with children on the trip" }); continue; }
      meals.push(p);
      continue;
    }
    if ((p.types ?? []).some((t) => NOT_A_VISIT.includes(t)) || NOT_A_VISIT_NAME.test(p.title)) continue;
    if (isEvening(p) || isErrand(p)) { meals.push(p); continue; }
    acts.push(p);
  }

  // Regions: single-link chains within REGION_KM, over places you visit and eat at.
  const all = [...acts, ...meals];
  const regionOf = new Map<string, number>();
  let nRegions = 0;
  for (const seed of all) {
    if (regionOf.has(seed.id)) continue;
    const id = nRegions++;
    const stack = [seed];
    regionOf.set(seed.id, id);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const o of all) if (!regionOf.has(o.id) && km(cur, o) <= REGION_KM) { regionOf.set(o.id, id); stack.push(o); }
    }
  }

  // Groups within each region: closest pair first, while the merge is still one day.
  type G = { items: (Pin & { lat: number; lng: number })[]; open: string };
  const groups: DayGroup[] = [];
  for (let r = 0; r < nRegions; r++) {
    const mine = acts.filter((p) => regionOf.get(p.id) === r);
    const span = SPAN_KM;
    let gs: G[] = mine.map((p) => ({ items: [p], open: openOf(p) }));
    for (;;) {
      let best: { i: number; j: number; d: number } | null = null;
      for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const items = [...gs[i].items, ...gs[j].items];
        if (!fits(items)) continue;
        if (!andDays(gs[i].open, gs[j].open).includes("1")) continue;
        let reach = 0;
        for (const a of gs[i].items) for (const b of gs[j].items) reach = Math.max(reach, km(a, b));
        if (reach > span) continue;
        if (!best || reach < best.d) best = { i, j, d: reach };
      }
      if (!best) break;
      const merged: G = { items: [...gs[best.i].items, ...gs[best.j].items], open: andDays(gs[best.i].open, gs[best.j].open) };
      gs = gs.filter((_, k) => k !== best!.i && k !== best!.j).concat(merged);
    }
    // A quarter-day on its own (a stamp shop) is not a day: it joins the
    // nearest group it fits.
    for (const small of gs.filter((g) => g.items.length === 1 && loadOf(g.items) <= 0.25)) {
      const home = gs
        .filter((g) => g !== small && fits([...g.items, ...small.items]) && andDays(g.open, small.open).includes("1"))
        .map((g) => ({ g, d: Math.max(...g.items.map((i) => km(i, small.items[0]))) }))
        .filter((c) => c.d <= span)
        .sort((a, b) => a.d - b.d)[0];
      if (home) { home.g.items.push(...small.items); home.g.open = andDays(home.g.open, small.open); gs = gs.filter((g) => g !== small); }
    }
    for (const g of gs) groups.push({ region: r, items: g.items, meals: [], load: loadOf(g.items), openDays: g.open, centre: centreOf(g.items) });
  }

  // Meals: nearest group in the same region with a free slot, open on a common day.
  const cap = (sub: string | null) => (sub === "restaurant" ? 2 : 1);
  const slot = (m: Pin) => (isEvening(m) ? "evening" : isErrand(m) ? "errand" : m.subType);
  const spareMeals: Pin[] = [];
  const sorted = [...meals].sort((a, b) => a.title.localeCompare(b.title));
  for (const m of sorted) {
    const candidates = groups
      .filter((g) => g.region === regionOf.get(m.id))
      .filter((g) => g.meals.filter((x) => slot(x) === slot(m)).length < cap(isEvening(m) || isErrand(m) ? null : m.subType))
      .filter((g) => andDays(g.openDays, openOf(m)).includes("1"))
      .map((g) => ({ g, d: Math.min(...g.items.map((i) => km(i as { lat: number; lng: number }, m))) }))
      .filter((c) => c.d <= MEAL_KM)
      .sort((a, b) => a.d - b.d);
    if (candidates.length) {
      const g = candidates[0].g;
      g.meals.push(m);
      g.openDays = andDays(g.openDays, openOf(m));
    } else spareMeals.push(m);
  }

  const regions: Region[] = [];
  for (let r = 0; r < nRegions; r++) {
    const inR = all.filter((p) => regionOf.get(p.id) === r);
    const days = groups.filter((g) => g.region === r).length;
    regions.push({ id: r, centre: centreOf(inR), days, pins: inR.length });
  }
  const visited = regions.filter((r) => r.days > 0).length;
  const daysNeeded = groups.length + MOVE_DAYS * Math.max(0, visited - 1);
  return { regions, groups, daysNeeded, spareMeals, left };
}
