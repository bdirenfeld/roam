// ── The one name for a place's kind ───────────────────────────────────────
// "Restaurant", "Dessert", "Explore" — the small word above a title on
// the desktop Agenda and inside the caption line everywhere else. There were
// two tables (CardSurface and PlanBoard), each missing half the taxonomy, so
// Gelateria Veneta got nothing where Trattoria da Giulio got "Restaurant"
// (Brennan, Sep 2026). One table, every sub-type the database holds, and a
// humanised fallback so a new kind is never blank.

export const SUB_TYPE_LABEL: Record<string, string> = {
  // food
  restaurant:       "Restaurant",
  coffee:           "Coffee",
  dessert:          "Dessert",
  bar:              "Bar",
  fine_dining:      "Fine dining",
  // 18 Nov 2026: a bakery is not a dessert stop, a market is an outing, not a meal.
  bakery:           "Bakery",
  market:           "Market",
  // activity
  // "Guided" and "Self-directed" were the database talking. A tour is a tour
  // (Colosseum, the Vatican, the truffle hunt, the cooking classes), and the
  // 41 cards on the other side are beaches, gardens, piazzas, trailheads and
  // bookshops — things you go and look at with nobody leading you. "Explore"
  // carries all of those; "Visit" breaks on the walks and "Solo" is plain
  // wrong when you are there with four other people (Brennan, Sep 2026).
  guided:           "Tour",
  self_directed:    "Explore",
  wellness:         "Wellness",
  // A destination race — Brennan's reason for keeping this one. "Race" rather
  // than "Challenge", which also reads as a hard hike or a climb.
  challenge:        "Race",
  event:            "Event",
  shopping:         "Shopping",
  beach:            "Beach",
  // A kids' day camp or class: nine to three, most weekdays (27 Sep 2026).
  camp:             "Camp",
  // Explore held 195 cards (18 Nov 2026); these name the place, not the audience
  // ("Kids" was too vague, Brennan): a playground is a Park, an aquarium a Zoo.
  museum:           "Museum",
  hike:             "Hike",
  park:             "Park",
  zoo:              "Zoo",
  theme_park:       "Theme park",
  // A one-off tag from an import; Event already means anything on a fixed date.
  festival:         "Event",
  // logistics
  hotel:            "Hotel",
  accommodation:    "Hotel",
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
  transit:          "Transit",
  // A cruise's port of call (17 Nov 2026, Don): docks → all aboard, time ashore between.
  port:             "Port",
  grocery:          "Grocery",
  // Boarding or daycare for the dog. Its own kind because "hotel" is what the
  // accommodation logic reads as "where you are staying", and Finn's hotel is
  // not Brennan's (Sep 2026).
  pet_care:         "Pet care",
  // Medical split three ways (18 Nov 2026): the value "medical" stays and reads Clinic.
  medical:          "Clinic",
  hospital:         "Hospital",
  pharmacy:         "Pharmacy",
  // Roam reads rental confirmations; they used to land as Transit.
  car_rental:       "Car rental",
  // older spellings still in a few rows
  hosted:           "Tour",
  coffee_dessert:   "Coffee",
  cocktail_bar:     "Bar",
  drinks:           "Bar",
  note:             "Note",
};

export function subTypeLabel(subType: string | null | undefined): string | null {
  if (!subType) return null;
  const known = SUB_TYPE_LABEL[subType];
  if (known) return known;
  const words = subType.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : null;
}
