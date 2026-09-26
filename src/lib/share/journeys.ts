/**
 * Which journey a shared place belongs to.
 *
 * Sharing from TikTok saves straight onto a journey's map (Brennan, 26 Sep
 * 2026: "cut out all the middle steps"), so the app has to pick the journey
 * itself. It picks only when the answer is obvious: the place sits within
 * NEARBY_KM of the journey's destination or of any pin already on it. A
 * journey's destination is one point ("Tuscany, Italy" is a spot near Siena)
 * while its pins cover the ground it actually spans — Elba is 150 km from the
 * destination point and next to a dozen Tuscany pins.
 *
 * Nothing close → null, and the person picks from the ranked list.
 */

export interface ShareJourney {
  id: string;
  title: string;
  archived: boolean;
  /** The destination point plus every pinned place, as [lat, lng]. */
  points: [number, number][];
}

export interface RankedJourney {
  journey: ShareJourney;
  km: number;
}

export const NEARBY_KM = 150;

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Closest approach of a journey to a place; Infinity when it has no points. */
export function journeyDistanceKm(j: ShareJourney, lat: number, lng: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [pLat, pLng] of j.points) {
    const d = distanceKm(lat, lng, pLat, pLng);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Every journey, nearest first — archived ones after the rest, the way the
 * journeys list already reads. This is the order of the pick list.
 */
export function rankJourneys(journeys: ShareJourney[], lat: number, lng: number): RankedJourney[] {
  return journeys
    .map((journey) => ({ journey, km: journeyDistanceKm(journey, lat, lng) }))
    .sort((a, b) =>
      a.journey.archived === b.journey.archived ? a.km - b.km : a.journey.archived ? 1 : -1,
    );
}

/**
 * The journey to save to without asking, or null. An archived journey counts
 * — Brennan archives journeys he is holding, not ones he has given up (the
 * Santa Barbara anniversary is archived and three weeks away) — but a live
 * journey inside the radius wins over an archived one.
 */
export function nearbyJourney(journeys: ShareJourney[], lat: number, lng: number): ShareJourney | null {
  const close = rankJourneys(journeys, lat, lng).filter((r) => r.km <= NEARBY_KM);
  return close[0]?.journey ?? null;
}
