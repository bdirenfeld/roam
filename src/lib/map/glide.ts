/**
 * How long the map takes to move between Where to stay's places (2 Oct 2026).
 *
 * Brennan: switching Where to stay from Osaka to Tokyo (~400 km) was "super
 * slow". Mapbox's flyTo (and fitBounds, which calls it) times the move from
 * the distance, so that hop took about 4.3 s on a computer and 5.7 s on a
 * phone at street zoom, while a pin next door took under 0.2 s. His ruling on
 * the feel: "don't make it aggressive and jerky… it just needs to not lag or
 * look jumpy". So every move is an eased glide of 0.9–1.4 s, whatever the
 * distance: a short hop is not a snap, a long one is not a crawl.
 *
 * Two traps behind the numbers:
 * - Mapbox's `maxDuration` does NOT cap a move. Past it, the duration is set to
 *   0 and the map jump-cuts. Always pass `duration` instead.
 * - A long hop keeps flyTo's arc (out, across, in). An easeTo across 400 km at
 *   street zoom would pan over every tile between the two cities, which is
 *   where a glide starts to stutter. Near hops (under NEAR_KM) ease straight
 *   across, where an arc would only bob.
 */

export const GLIDE_MIN_MS = 900;
export const GLIDE_MAX_MS = 1400;
/** At this distance and beyond, the move takes the most time it is allowed. */
export const GLIDE_FULL_KM = 300;
/** Closer than this, ease straight across rather than arc. */
export const NEAR_KM = 25;

export interface LngLat { lng: number; lat: number }

export function kmBetween(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The move's length in ms: rises gently with distance (on a log scale), capped both ways. */
export function glideMs(km: number): number {
  if (!isFinite(km) || km <= 0) return GLIDE_MIN_MS;
  const t = Math.min(1, Math.log10(1 + km) / Math.log10(1 + GLIDE_FULL_KM));
  return Math.round(GLIDE_MIN_MS + (GLIDE_MAX_MS - GLIDE_MIN_MS) * t);
}

/** The middle of a set of points' bounding box: where a fitBounds is heading. */
export function boxCentre(pts: [number, number][]): LngLat | null {
  if (!pts.length) return null;
  const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  return { lng: (Math.min(...lngs) + Math.max(...lngs)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
}

/**
 * Mapbox options for one move from where the map is to where it is going.
 * `linear: true` is fitBounds' switch to easeTo; for a single point the caller
 * picks easeTo when `linear`, else flyTo. Never a `maxDuration`.
 */
export function stayGlide(from: LngLat | null, to: LngLat | null): { duration: number; linear: boolean } {
  const km = from && to ? kmBetween(from, to) : 0;
  return { duration: glideMs(km), linear: km < NEAR_KM };
}
