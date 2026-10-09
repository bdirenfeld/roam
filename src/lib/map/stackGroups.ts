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

/**
 * How far a tap on a pile zooms (3 Oct 2026). Fitting the pile into the map's
 * padding can give a LOWER zoom than now (a big sheet leaves little room), and
 * Brennan's tap on "1 – 4" zoomed out. A pile's pins overlap, so the answer is
 * always closer: at least `step` levels in, more if the fit needs it, never past `max`.
 */
export function pileZoom(current: number, fit: number | null | undefined, step = 1.5, max = 17): number {
  const floor = current + step;
  const want = fit != null && Number.isFinite(fit) ? Math.max(fit, floor) : floor;
  return Math.min(want, max);
}

/**
 * Two or three touching pins sit side by side instead of piling (8 Oct 2026,
 * mock "pins4"): a pile hid each stop's colour and icon, so a food stop next to
 * an activity read as one thing. Larger crowds still pile and zoom on a tap.
 */
export const SIDE_BY_SIDE_MAX = 3;

/**
 * Where each pin of a small group moves to, as an offset from its own screen
 * point: all on one row through the group's centre, `gap` px apart, in their
 * real left-to-right order, so nothing swaps sides as you zoom in and the row
 * opens back onto the true spots (8 Oct 2026, Brennan: "it switches positions
 * when you zoom in"; the row went by list order). Returns [dx, dy] per point.
 */
export function sideBySide(pts: { x: number; y: number }[], gap: number): [number, number][] {
  if (pts.length === 0) return [];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const slot = new Map(pts.map((p, i) => ({ p, i })).sort((a, b) => a.p.x - b.p.x || a.i - b.i).map((o, k) => [o.i, k]));
  return pts.map((p, i) => [cx + (slot.get(i)! - (pts.length - 1) / 2) * gap - p.x, cy - p.y]);
}

/** Two pins count as stacked once their discs overlap at all, with a little slack for the number badge. */
export const STACK_FACTOR = 1.1;
