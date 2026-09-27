export type RoamType = "food" | "activity" | "logistics";

export interface InferredType {
  type: RoamType | null;
  sub_type: string | null;
}

// First-match-wins: iterate rules in order, return on first Google type present in the set.
const RULES: ReadonlyArray<readonly [string, RoamType, string]> = [
  ["restaurant",              "food",      "restaurant"],
  ["meal_takeaway",           "food",      "restaurant"],
  ["meal_delivery",           "food",      "restaurant"],
  ["cafe",                    "food",      "coffee"],
  ["bakery",                  "food",      "dessert"],
  ["ice_cream_shop",          "food",      "dessert"],
  ["dessert",                 "food",      "dessert"],
  ["bar",                     "food",      "bar"],
  ["night_club",              "food",      "bar"],
  // Generic "food" must sit above the retail rules: Google's legacy details
  // tag a gelateria as ["food","point_of_interest","store","establishment"],
  // and without this row "store" won and a gelateria became a shop.
  ["food",                    "food",      "restaurant"],
  ["lodging",                 "logistics", "hotel"],
  ["hotel",                   "logistics", "hotel"],
  ["airport",                 "logistics", "flight_arrival"],
  ["transit_station",         "logistics", "transit"],
  ["train_station",           "logistics", "transit"],
  ["subway_station",          "logistics", "transit"],
  ["bus_station",             "logistics", "transit"],
  ["grocery_or_supermarket",  "logistics", "grocery"],
  ["supermarket",             "logistics", "grocery"],
  ["hospital",                "logistics", "medical"],
  ["doctor",                  "logistics", "medical"],
  ["health",                  "logistics", "medical"],
  ["pharmacy",                "logistics", "medical"],
  ["drugstore",               "logistics", "medical"],
  ["shopping_mall",           "activity",  "shopping"],
  ["clothing_store",          "activity",  "shopping"],
  ["spa",                     "activity",  "wellness"],
  ["gym",                     "activity",  "wellness"],
  ["beauty_salon",            "activity",  "wellness"],
  ["museum",                  "activity",  "guided"],
  ["art_gallery",             "activity",  "guided"],
  // Generic "store" after the museums: the Ryman Auditorium has a gift shop,
  // and "store" above "museum" made a concert hall Shopping (27 Sep 2026).
  ["store",                   "activity",  "shopping"],
  ["tourist_attraction",      "activity",  "self_directed"],
  ["park",                    "activity",  "self_directed"],
  ["zoo",                     "activity",  "self_directed"],
  ["aquarium",                "activity",  "self_directed"],
  ["amusement_park",          "activity",  "self_directed"],
  ["stadium",                 "activity",  "event"],
  ["movie_theater",           "activity",  "event"],
  ["performing_arts_theater", "activity",  "event"],
];

/**
 * inferType, but never empty: a place Google tags only as a street, a
 * neighbourhood or a bare point_of_interest (Tsukiji Outer Market, Takeshita
 * Street, Dotonbori, Mount Royal Chalet) becomes a sight you wander. Without
 * this the map's Save sat greyed out and the assistant's imports dropped the
 * place silently (26 Sep 2026). A wrong guess is one tap to re-type.
 */
export function inferTypeOrSight(googleTypes: string[] | null | undefined, name?: string | null): { type: RoamType; sub_type: string } {
  if (isBarLike(googleTypes, name)) return { type: "food", sub_type: "bar" };
  if (isCampName(name) && !(googleTypes ?? []).some((t) => t === "lodging" || t === "campground")) return { type: "activity", sub_type: "camp" };
  const t = inferType(googleTypes);
  if ((t.type === null || t.sub_type === "self_directed") && isPortName(name)) return { type: "logistics", sub_type: "transit" };
  return t.type && t.sub_type ? { type: t.type, sub_type: t.sub_type } : { type: "activity", sub_type: "self_directed" };
}

/**
 * A cruise terminal, ferry terminal or port, read from its name (27 Sep 2026).
 * Google gives these no category of their own: Barcelona's Cruise Terminal B,
 * Palma's Estació Marítima and Marseille's cruise terminal are all just
 * "establishment, point_of_interest", and Civitavecchia's port comes back as a
 * tourist attraction, so a cruise day filed the ship's port as a sight to
 * wander. Only overrides a sight or nothing, never a museum or a restaurant.
 */
const PORT_NAME = /\b(cruise|cruises|ferry|ferries|creuers|cruceros|croisi[eè]res?|crociere)\b|\bmar[ií]tim[ao]\b|\bmarittima\b|\b(porto|puerto|port) (di|de|del|of)\b|\bport$/i;
/**
 * A bar, not a restaurant (27 Sep 2026). Google tags a Broadway honky-tonk
 * and a restaurant with a bar the same way — "bar, food, restaurant" in
 * alphabetical order — so Tootsie's Orchid Lounge went on the day at lunch.
 * It is a bar when Google says bar and not restaurant, or says both and the
 * name says bar. Husk and Roscioli (bar + restaurant) stay restaurants.
 */
const BAR_NAME = /\b(bar|pub|lounge|saloon|tavern|taproom|brewery|brewing|speakeasy|cocktails?|aperitivo|honky[- ]?tonk)\b|beer garden/i;
export function isBarLike(googleTypes: string[] | null | undefined, name: string | null | undefined): boolean {
  const t = new Set(googleTypes ?? []);
  if (!t.has("bar") && !t.has("night_club")) return false;
  return !t.has("restaurant") || BAR_NAME.test(name ?? "");
}

/**
 * A kids' day camp or class, from its name (27 Sep 2026): "TBKids Barcelona"
 * is a school to Google, "Summer Camp Barcelona Enforex" a point of interest.
 * Not a campground or camping, which are somewhere to sleep.
 */
export function isCampName(name: string | null | undefined): boolean {
  return !!name && /\b(day ?camps?|summer ?camps?|camps?|campus d'estiu|campamentos?|centro estivo|colonie?s? de vacances)\b/i.test(name) && !/\bcamp(ground|site|ing)\b/i.test(name);
}

/** A journey named as a cruise ("Mediterranean cruise", "Alaska sailing"). */
export function isCruiseName(name: string | null | undefined): boolean {
  return !!name && /\b(cruise|cruising|sailing|voyage)\b/i.test(name);
}

export function isPortName(name: string | null | undefined): boolean {
  return !!name && PORT_NAME.test(name.trim());
}

export function inferType(googleTypes: string[] | null | undefined): InferredType {
  if (!googleTypes || googleTypes.length === 0) return { type: null, sub_type: null };
  const set = new Set(googleTypes);
  for (const [googleType, type, sub_type] of RULES) {
    if (set.has(googleType)) return { type, sub_type };
  }
  return { type: null, sub_type: null };
}
