// ── The one name for a place's kind ───────────────────────────────────────
// "Restaurant", "Dessert", "Self-directed" — the small word above a title on
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
  // activity
  guided:           "Guided",
  self_directed:    "Self-directed",
  wellness:         "Wellness",
  challenge:        "Challenge",
  event:            "Event",
  shopping:         "Shopping",
  beach:            "Beach",
  // logistics
  hotel:            "Hotel",
  accommodation:    "Hotel",
  flight_arrival:   "Arrival",
  flight_departure: "Departure",
  transit:          "Transit",
  grocery:          "Grocery",
  medical:          "Medical",
  // older spellings still in a few rows
  hosted:           "Guided",
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
