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
  ["store",                   "activity",  "shopping"],
  ["spa",                     "activity",  "wellness"],
  ["gym",                     "activity",  "wellness"],
  ["beauty_salon",            "activity",  "wellness"],
  ["museum",                  "activity",  "guided"],
  ["art_gallery",             "activity",  "guided"],
  ["tourist_attraction",      "activity",  "self_directed"],
  ["park",                    "activity",  "self_directed"],
  ["zoo",                     "activity",  "self_directed"],
  ["aquarium",                "activity",  "self_directed"],
  ["amusement_park",          "activity",  "self_directed"],
  ["stadium",                 "activity",  "event"],
  ["movie_theater",           "activity",  "event"],
  ["performing_arts_theater", "activity",  "event"],
];

export function inferType(googleTypes: string[] | null | undefined): InferredType {
  if (!googleTypes || googleTypes.length === 0) return { type: null, sub_type: null };
  const set = new Set(googleTypes);
  for (const [googleType, type, sub_type] of RULES) {
    if (set.has(googleType)) return { type, sub_type };
  }
  return { type: null, sub_type: null };
}
