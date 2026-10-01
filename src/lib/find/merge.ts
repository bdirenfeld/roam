/**
 * Find's results, put together (29 Sep 2026). Two sources: places travellers
 * recommend (Claude reads the web, every name checked on Google) and places
 * Google rates well nearby. Travellers first, because a reason from someone
 * who went beats a star rating; one place once; nothing already on the
 * journey; nothing more than FAR_KM from the base (a checked name can still
 * be the wrong branch of a chain in another city).
 */

export interface FindResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  reviews: number | null;
  why: string;
  source: { name: string; url: string } | null;
  from: "travellers" | "google";
  kids: boolean;
  /** Google types, for fitsCategory. */
  types?: string[];
  /** A small photo (Google's), resolved once by the route and kept in the shared cache. */
  photo?: string | null;
  /** Google's reference for that photo, before it is resolved. */
  photoRef?: string | null;
}

export const FAR_KM = 60;
/** Events reach a day trip away: Montepulciano's barrel race is 130 km from Lucca. */
export const EVENT_FAR_KM = 170;
export const MAX_RESULTS = 12;
/** The sheet's list, both halves together: enough to reach two sights a day on a week's trip. */
export const MAX_SHOWN = 12;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A well-rated Google place: 4.3 or better from at least 100 reviews. */
export const wellRated = (rating: number | null, reviews: number | null) => (rating ?? 0) >= 4.3 && (reviews ?? 0) >= 100;

export function mergeFind(
  base: { lat: number; lng: number },
  travellers: FindResult[],
  google: FindResult[],
  alreadyOnTrip: Set<string>,
  /** The journey's places by name and position: the Colosseum under Guided is the Colosseum saved under Explore. */
  onTrip: { name: string; lat: number; lng: number }[] = [],
  farKm: number = FAR_KM,
): FindResult[] {
  const out: FindResult[] = [];
  const seen = new Set<string>();
  const known = onTrip.map((p) => ({ ...p, placeId: "", address: "", rating: null, reviews: null, why: "", source: null, from: "google" as const, kids: false }));
  const onJourney = (r: FindResult) => alreadyOnTrip.has(r.placeId) || known.some((k) => samePlace(k, r, true));
  const ranked = [...google].sort((a, b) => (b.rating ?? 0) * Math.log10((b.reviews ?? 0) + 10) - (a.rating ?? 0) * Math.log10((a.reviews ?? 0) + 10));
  for (const r of [...travellers, ...ranked]) {
    if (out.length >= MAX_RESULTS) break;
    // One branch of a chain: 787 Coffee came back four times near New York's sights.
    const name = "name:" + r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(r.placeId) || seen.has(name) || onJourney(r)) continue;
    if (km(base, r) > farKm) continue;
    if (r.from === "google" && !wellRated(r.rating, r.reviews)) continue;
    seen.add(r.placeId);
    seen.add(name);
    out.push(r);
  }
  return out;
}

// ── Does a place belong in the category? (Rome test, 29 Sep 2026) ─────────
// Boccione, a bakery, came back under Explore and was planned as a 2.5-hour
// sight. Google's types decide: a sight is never ONLY somewhere to eat, and
// somewhere to eat must be one. No types (rare) means no opinion.
const FOOD = ["restaurant", "cafe", "bakery", "bar", "meal_takeaway", "meal_delivery", "food", "night_club", "liquor_store"];
const SIGHT = ["tourist_attraction", "museum", "park", "church", "place_of_worship", "art_gallery", "zoo", "aquarium", "amusement_park", "natural_feature", "stadium", "library", "campground", "city_hall", "synagogue", "mosque", "hindu_temple"];
const FOOD_SUBTYPES = ["restaurant", "coffee", "dessert", "bar"];
// Shops that are only shops. A bookshop is Explore in Roam (his Strand and McNally Jackson).
const SHOP = ["clothing_store", "shoe_store", "jewelry_store", "department_store", "shopping_mall", "home_goods_store", "furniture_store", "electronics_store"];

// Never a place to visit, in any category: a traveller's "Colosseo" came back
// as the metro station and was planned as a 2.5-hour sight (Rome test 2).
// A cinema too: Montecatini's Terme Excelsior came back as the Excelsior multiplex (30 Sep 2026).
const NOT_A_PLACE = ["transit_station", "subway_station", "train_station", "bus_station", "light_rail_station", "parking", "route", "neighborhood", "sublocality", "postal_code", "country", "movie_theater"];

export function fitsCategory(subType: string, types: string[] | undefined): boolean {
  if (!types || types.length === 0) return true;
  // An event or a race happens in a square or a town: Google types Piazza
  // Grande, where Montepulciano rolls its barrels, as a street ("route"), and
  // every Tuscany event came back empty (30 Sep 2026). Only a car park or a
  // station is never where one is.
  if (subType === "event" || subType === "challenge") return !types.some((t) => ["parking", "transit_station", "subway_station", "train_station", "bus_station", "light_rail_station", "postal_code", "country"].includes(t));
  if (types.some((t) => NOT_A_PLACE.includes(t))) return false;
  const food = types.some((t) => FOOD.includes(t));
  if (FOOD_SUBTYPES.includes(subType)) return food;
  // Cooking classes and food tours are Tours that Google types as restaurants
  // (InRome Cooking Classes, on his real Rome trip).
  if (subType === "guided") return true;
  const sight = types.some((t) => SIGHT.includes(t));
  if (subType === "self_directed") {
    // Costa Rica test (29 Sep 2026): tour companies ("travel_agency") and a
    // clothing shop came back as places to explore. A tour is a Tour; a shop
    // that is only a shop is not somewhere to explore.
    if (types.includes("travel_agency")) return false;
    if (types.some((t) => SHOP.includes(t)) && !sight) return false;
  }
  return !food || sight;
}

// Two names for one place (Rome test 2, 29 Sep 2026): a traveller's
// "Colosseo" resolved to a different Google listing from Google's own
// "Colosseum", and "Pantheon" to the piazza in front of it. Close together
// and sharing a word stem means one place: keep Google's listing (the one
// people know, with its reviews) and the traveller's reason and source.
const NEAR_M = 250;
const GENERIC = new Set(["piazza", "della", "delle", "trattoria", "osteria", "hostaria", "ristorante", "restaurant", "caffe", "cafe", "coffee", "pizzeria", "gelateria", "museum", "museo", "basilica", "church", "chiesa", "park", "parco", "the", "and", "via", "plaza", "place", "street", "bar"]);
const stems = (name: string) => new Set(
  name.toLowerCase().normalize("NFD").replace(/[^a-z\s]/g, "").split(/\s+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w)).map((w) => w.slice(0, 5)),
);
// `strict`, for what is already on the journey across categories: the same
// name, within half a kilometre (the Colosseum's tour listing is 390 m from
// the Colosseum). Loose would let Roscioli Caffè hide Roscioli Salumeria.
export function samePlace(a: FindResult, b: FindResult, strict = false): boolean {
  if (a.placeId && a.placeId === b.placeId) return true;
  if (km(a, b) * 1000 > (strict ? 2 * NEAR_M : NEAR_M)) return false;
  const sa = stems(a.name), sb = stems(b.name);
  if (sa.size === 0 || sb.size === 0) return false;
  let shared = 0;
  sb.forEach((w) => { if (sa.has(w)) shared++; });
  return strict ? shared === sa.size && shared === sb.size : shared > 0;
}

/**
 * Google answers in about a second and the travellers in 20 to 40, so the
 * sheet shows Google's first and puts the travellers on top when they land.
 * Each list arrives already merged by the route; this only joins them.
 */
export function combineFind(travellers: FindResult[] | undefined, google: FindResult[] | undefined): FindResult[] {
  const out: FindResult[] = [];
  const seen = new Set<string>();
  const g = google ?? [];
  const used = new Set<string>();
  for (const t of travellers ?? []) {
    const twin = g.find((x) => !used.has(x.placeId) && samePlace(t, x));
    if (twin) used.add(twin.placeId);
    const r = twin ? { ...twin, why: t.why, source: t.source, from: t.from, kids: t.kids || twin.kids } : t;
    if (seen.has(r.placeId)) continue;
    seen.add(r.placeId);
    out.push(r);
  }
  for (const r of g) {
    if (used.has(r.placeId) || seen.has(r.placeId)) continue;
    seen.add(r.placeId);
    out.push(r);
  }
  return out.slice(0, MAX_SHOWN);
}

/**
 * A beach, by its name in the languages his journeys use, or Google's
 * natural-feature type. Google's half for "best beaches near" a Tuscan base
 * returned a racecourse, a department store, a gym, a hotel, Vespa tours and
 * Santa Croce (30 Sep 2026); the travellers' half was right, so only Google's
 * listings must pass.
 */
const BEACH_NAME = /\b(beach|beaches|spiagg\w*|playa\w*|plage\w*|praia\w*|strand\w*|lido|bagn[oi]|cal[ae]|caletta|baia|bay|cove|shore|seaside|marina|kaigan|hama)\b|海岸|浜|ビーチ/i;
export function isBeach(name: string, types: string[] | undefined): boolean {
  return BEACH_NAME.test(name) || (types ?? []).includes("natural_feature");
}

/**
 * A tour, class or experience: by name (English, Italian, Japanese) or
 * Google's type, and never a company listing. Shimane's Google half for Tours
 * held a TV station, a university, a consultancy and bus companies (30 Sep 2026).
 */
const TOUR_NAME = /\b(tours?|class(es)?|experiences?|cooking|workshop|making|cruise|boat|sightseeing|walk(ing)?|guide[sd]?|tasting|safari|excursions?|tour guide|corso|corsi|lezion\w*|degustazion\w*|visita|escursion\w*)\b|ツアー|体験|教室|クルーズ|遊覧|めぐり|乗船/i;
const COMPANY_NAME = /\b(co\.,? ?ltd|inc\.|corporation|broadcasting|university|consult\w*)\b|株式会社|（株）|\(株\)|大学/i;
export function isTour(name: string, types: string[] | undefined): boolean {
  if (COMPANY_NAME.test(name)) return false;
  return TOUR_NAME.test(name) || (types ?? []).some((t) => ["travel_agency", "tourist_attraction", "museum", "amusement_park", "aquarium", "zoo"].includes(t));
}
