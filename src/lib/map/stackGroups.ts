/**
 * Which pins on the day map stand as one (2 Oct 2026). Pins whose screen
 * positions are closer than `near` px share a group, and the grouping is
 * chained: a pin touching any member joins, so a pin half over a "2 · 3"
 * stack is part of it. Before this the check ran only against each group's
 * first pin, so pin 4 sat half over "2 · 3" in Paris, stayed its own pin, and
 * a tap on the pile opened one card instead of zooming in to show them all.
 *
 * Returns groups of indexes into `pts`, each in input order; singletons too.
 */
export function stackGroups(pts: { x: number; y: number }[], near: number): number[][] {
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      if (Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) < near) parent[find(b)] = find(a);
    }
  }
  const by = new Map<number, number[]>();
  pts.forEach((_, i) => { const r = find(i); by.set(r, [...(by.get(r) ?? []), i]); });
  return Array.from(by.values());
}

/** Two pins count as stacked once their discs overlap at all, with a little slack for the number badge. */
export const STACK_FACTOR = 1.1;
