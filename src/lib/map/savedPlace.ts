/**
 * "On your map" in the map search (6 Oct 2026, taps audit).
 *
 * A search result whose Google place id is already pinned on this journey
 * opens that pin instead of the add sheet — the add sheet then asked "Already
 * saved — save it again?", two taps to learn something the map knew.
 */

interface PinnedCard {
  id: string;
  status?: string | null;
  place?: { google_place_id?: string | null; lat?: number | null; lng?: number | null } | null;
}

/** Google place ids pinned on the map (cards with a place and coordinates). */
export function savedPlaceIds(cards: PinnedCard[]): Set<string> {
  const out = new Set<string>();
  for (const c of cards) {
    const gid = c.place?.google_place_id;
    if (gid && c.place?.lat != null && c.place?.lng != null) out.add(gid);
  }
  return out;
}

/**
 * The card to open for a Google place id, or null. A place can be on the map
 * twice (a saved copy and a scheduled one); the scheduled one is the pin the
 * map draws first, so it wins.
 */
export function savedCardForPlace<T extends PinnedCard>(cards: T[], googlePlaceId: string): T | null {
  const hits = cards.filter(
    (c) => c.place?.google_place_id === googlePlaceId && c.place?.lat != null && c.place?.lng != null,
  );
  if (hits.length === 0) return null;
  return hits.find((c) => c.status === "in_itinerary") ?? hits[0];
}
