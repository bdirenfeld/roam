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
}

export const FAR_KM = 60;
export const MAX_RESULTS = 8;

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
): FindResult[] {
  const out: FindResult[] = [];
  const seen = new Set<string>();
  const ranked = [...google].sort((a, b) => (b.rating ?? 0) * Math.log10((b.reviews ?? 0) + 10) - (a.rating ?? 0) * Math.log10((a.reviews ?? 0) + 10));
  for (const r of [...travellers, ...ranked]) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(r.placeId) || alreadyOnTrip.has(r.placeId)) continue;
    if (km(base, r) > FAR_KM) continue;
    if (r.from === "google" && !wellRated(r.rating, r.reviews)) continue;
    seen.add(r.placeId);
    out.push(r);
  }
  return out;
}
