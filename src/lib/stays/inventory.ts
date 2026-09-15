// ── Which of Google's two inventories to ask ──────────────────────────────
// Hotels and vacation rentals are separate lists and a search sees one of
// them, so the stay search asks for both and merges (see the search route).
//
// But Google Hotels refuses a party over six outright:
//
//   "Total number of travelers should be less than or equal to 6"
//
// Tuscany is seven — Brennan, Isha, three children and both grandparents — so
// the hotel half of every Tuscany search has been erroring out and returning
// nothing (found 11 Sept 2026, probing the API with the journey's real
// party). That is wasted on a villa journey and fatal on a hotel-shaped one,
// where it would be the only search that ran.
//
// Seven people do not sleep in a hotel room anyway, so above the cap the
// answer is rentals, not an error.

/** Google Hotels will not price a party larger than this. */
export const MAX_HOTEL_GUESTS = 6;

// Google hands back about eighteen places a page. One page was the whole
// search, so a villa outside Google's top eighteen for "Lucca" did not exist
// as far as Roam knew (Brennan, 15 Sept 2026: "how do we get the API to
// search all the listings"). Probed on Lucca for a week in October: three
// pages, 18 + 18 + 18, all priced, one name shared between pages. Each page
// is one search credit, so the kind the journey wants gets three and the
// other kind one — four credits a run instead of two.
export const PAGES_WANTED = 3;
export const PAGES_OTHER = 1;

export interface Inventories {
  /** Ask for vacation rentals. */
  rentals: boolean;
  /** Ask for hotels. False when the party is too big for Google to price. */
  hotels: boolean;
  /** The kind the journey actually wants, which ranks first in the merge. */
  prefer: "rentals" | "hotels";
  /** How many pages of each to ask for. Zero when that inventory is not asked. */
  pages: { rentals: number; hotels: number };
}

export function inventoriesFor(partyTotal: number, wantHouse: boolean): Inventories {
  const hotelsPossible = partyTotal <= MAX_HOTEL_GUESTS;
  // A party too big for a hotel room prefers rentals whatever the journey
  // looked like, because hotels are not an option for them at all.
  const prefer = hotelsPossible && !wantHouse ? "hotels" : "rentals";
  return {
    rentals: true,
    hotels: hotelsPossible,
    prefer,
    pages: {
      rentals: prefer === "rentals" ? PAGES_WANTED : PAGES_OTHER,
      hotels: !hotelsPossible ? 0 : prefer === "hotels" ? PAGES_WANTED : PAGES_OTHER,
    },
  };
}
