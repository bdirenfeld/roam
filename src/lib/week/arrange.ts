/**
 * Arrange a day (25 Sep 2026): give a handful of places sensible times.
 * Rules, not a model: meals land in meal slots, sights follow one another in
 * walking order from an anchor (the stay, or the day's first block), each
 * with a default length, walking time between them, and the day's existing
 * timed blocks kept as obstacles. Deterministic, instant, the same every time.
 * Used by "put these pins on a day" from the map and "Arrange this day" from a
 * week header (the second only places blocks that have no time yet).
 */

export interface ArrangeItem {
  id: string;
  type: "activity" | "food" | "logistics";
  subType: string | null;
  lat: number | null;
  lng: number | null;
}
export interface Busy { startMin: number; endMin: number }
export interface Placed { id: string; startMin: number; endMin: number }
export interface Anchor { lat: number; lng: number }

export const DAY_START = 9 * 60;
export const DAY_END = 22 * 60;
const STEP = 15;

/** How long a thing takes, by what it is. */
export function durationFor(type: ArrangeItem["type"], subType: string | null): number {
  switch (subType) {
    case "coffee": return 45;
    case "dessert": return 30;
    case "restaurant": return 75;
    case "bar":
    case "drinks": return 90;
    case "tour":
    case "guided":
    case "hosted": return 120;
    case "wellness": return 90;
    case "beach": return 150;
    case "grocery": return 30;
    case "transit": return 30;
    default: return type === "food" ? 60 : 90;
  }
}

/** Walking minutes between two points: 80 m a minute, never under 5, never over 30. */
export function walkMinutes(a: Anchor, b: Anchor): number {
  const m = metres(a, b);
  return Math.max(5, Math.min(30, Math.round(m / 80)));
}
function metres(a: Anchor, b: Anchor): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Meal slots: [earliest, latest start], and where we would rather start. */
const SLOTS: Record<string, { lo: number; hi: number; want: number }[]> = {
  coffee:     [{ lo: 9 * 60, hi: 11 * 60, want: 9 * 60 }, { lo: 15 * 60, hi: 17 * 60, want: 15 * 60 + 30 }],
  restaurant: [{ lo: 12 * 60, hi: 14 * 60, want: 12 * 60 + 30 }, { lo: 19 * 60, hi: 21 * 60 + 30, want: 19 * 60 + 30 }],
  dessert:    [{ lo: 14 * 60, hi: 16 * 60, want: 14 * 60 + 15 }, { lo: 21 * 60, hi: 22 * 60 + 30, want: 21 * 60 + 15 }],
  bar:        [{ lo: 18 * 60, hi: 22 * 60, want: 20 * 60 + 45 }],
  drinks:     [{ lo: 18 * 60, hi: 22 * 60, want: 20 * 60 + 45 }],
};

const snap = (m: number) => Math.ceil(m / STEP) * STEP;

class Timeline {
  private taken: Busy[];
  constructor(busy: Busy[]) { this.taken = busy.map((b) => ({ ...b })); }
  private free(s: number, e: number): boolean {
    return !this.taken.some((b) => s < b.endMin && e > b.startMin);
  }
  /** Earliest start ≥ from (15-min steps) where [t, t+dur] is free and ends by `by`. */
  find(from: number, dur: number, by: number): number | null {
    for (let t = snap(from); t + dur <= by; t += STEP) if (this.free(t, t + dur)) return t;
    return null;
  }
  take(s: number, e: number) { this.taken.push({ startMin: s, endMin: e }); }
}

function isMeal(it: ArrangeItem): boolean { return !!(it.subType && SLOTS[it.subType]); }
function hasPoint(it: ArrangeItem): it is ArrangeItem & Anchor { return typeof it.lat === "number" && typeof it.lng === "number"; }

/** Nearest-neighbour order from the anchor; things without a point go last. */
export function walkingOrder<T extends ArrangeItem>(items: T[], anchor: Anchor | null): T[] {
  const located = items.filter(hasPoint) as (T & Anchor)[];
  const rest = items.filter((i) => !hasPoint(i));
  const out: T[] = [];
  let here: Anchor | null = anchor;
  const pool = [...located];
  while (pool.length) {
    let idx = 0;
    if (here) {
      let best = Infinity;
      pool.forEach((p, i) => { const d = metres(here as Anchor, p); if (d < best) { best = d; idx = i; } });
    }
    const [next] = pool.splice(idx, 1);
    out.push(next); here = next;
  }
  return [...out, ...rest];
}

export interface Arranged { placed: Placed[]; unplaced: string[] }

export function arrangeDay(items: ArrangeItem[], busy: Busy[], anchor: Anchor | null): Arranged {
  const tl = new Timeline(busy);
  const placed: Placed[] = [];
  const unplaced: string[] = [];

  // 1. meals into their slots, first slot first (two restaurants = lunch and dinner)
  const used: Record<string, number> = {};
  for (const it of items.filter(isMeal)) {
    const key = it.subType as string;
    const dur = durationFor(it.type, it.subType);
    const slots = SLOTS[key];
    let start: number | null = null;
    for (let k = used[key] ?? 0; k < slots.length && start === null; k++) {
      const s = slots[k];
      start = tl.find(s.want, dur, s.hi + dur) ?? tl.find(s.lo, dur, s.hi + dur);
      if (start !== null) used[key] = k + 1;
    }
    if (start === null) { unplaced.push(it.id); continue; }
    tl.take(start, start + dur); placed.push({ id: it.id, startMin: start, endMin: start + dur });
  }

  // 2. everything else in walking order, from the morning, walking time between
  const sights = walkingOrder(items.filter((i) => !isMeal(i)), anchor);
  let cursor = DAY_START + 30;
  let here: Anchor | null = anchor;
  for (const it of sights) {
    const dur = durationFor(it.type, it.subType);
    const walk = here && hasPoint(it) ? walkMinutes(here, it) : 10;
    const from = cursor + walk;
    const start = tl.find(from, dur, 24 * 60);
    if (start === null) { unplaced.push(it.id); continue; }
    tl.take(start, start + dur); placed.push({ id: it.id, startMin: start, endMin: start + dur });
    cursor = start + dur;
    if (hasPoint(it)) here = it;
  }

  placed.sort((a, b) => a.startMin - b.startMin);
  return { placed, unplaced };
}
