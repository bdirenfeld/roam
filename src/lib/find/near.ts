/**
 * Coffee and dessert near the day, not across the city (New York test,
 * 29 Sep 2026: Find's cafés were in Greenpoint, Long Island City and Park
 * Slope while the days were in Manhattan, and none made it into the plan).
 * When a base already has sights, those kinds are looked for around where
 * the sights cluster, and anything more than a short walk from all of them
 * is left out. A base with no sights yet is searched as a whole.
 */

type Point = { lat: number; lng: number };

/** The kinds you stop for on the way, not travel to. */
export const NEAR_PLAN = new Set(["coffee", "dessert"]);
/** A short walk, in km. */
export const WALK_KM = 1.5;

function km(a: Point, b: Point): number {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Up to `max` centres where the sights cluster: the sight with the most
 * others within a walk, the middle of that cluster, then the next among
 * what is left. Busiest first.
 */
export function nearCentres(sights: Point[], max = 3): Point[] {
  let left = sights.slice();
  const out: Point[] = [];
  while (left.length && out.length < max) {
    let best = left[0], bestN = -1;
    for (const s of left) {
      const n = left.filter((o) => km(s, o) <= WALK_KM).length;
      if (n > bestN) { bestN = n; best = s; }
    }
    const cluster = left.filter((o) => km(best, o) <= WALK_KM);
    out.push({ lat: cluster.reduce((a, p) => a + p.lat, 0) / cluster.length, lng: cluster.reduce((a, p) => a + p.lng, 0) / cluster.length });
    left = left.filter((o) => !cluster.includes(o));
  }
  return out;
}

/** Keep what is within a walk (a little more, for a cluster's edge) of any centre. No centres: keep everything. */
export function withinWalk<T extends Point>(items: T[], centres: Point[]): T[] {
  if (!centres.length) return items;
  return items.filter((p) => centres.some((c) => km(c, p) <= WALK_KM + 0.5));
}
