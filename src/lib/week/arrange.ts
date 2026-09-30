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
/** Where a day sits in the journey: its first day, its last, or neither. */
export interface DayEdge { first: boolean; last: boolean }

export const DAY_START = 9 * 60;
export const DAY_END = 22 * 60;
const STEP = 15;

/**
 * How long a thing takes, by what it is — and for a restaurant, by when:
 * dinner (from 5 pm) is two hours, lunch 75 minutes. Brennan, 30 Sep 2026:
 * "dinners would be 2 hours, coffee 30 minutes, a tour maybe 90 minutes".
 */
export function durationFor(type: ArrangeItem["type"], subType: string | null, startMin?: number | null): number {
  switch (subType) {
    case "coffee": return 30;
    case "dessert": return 30;
    case "restaurant": return startMin != null && startMin >= 17 * 60 ? 120 : 75;
    case "bar":
    case "drinks": return 90;
    case "tour":
    case "guided":
    case "hosted": return 90;
    case "wellness": return 90;
    case "beach": return 150;
    case "camp": return 360;
    case "hotel":
    case "accommodation": return 30;
    case "grocery": return 30;
    case "transit": return 30;
    default: return type === "food" ? 60 : 90;
  }
}

/**
 * Minutes to get from one point to the next (27 Sep 2026). Up to 2 km it is a
 * walk, 80 m a minute, never under 5. Beyond that it is a train, a taxi or a
 * tender: 15 minutes to get going plus about 40 km/h, in 5-minute steps. The
 * old rule capped every hop at 30 minutes, so a cruise day put the Colosseum
 * 30 minutes from the ship at Civitavecchia, 70 km away.
 */
export function travelMinutes(a: Anchor, b: Anchor): number {
  const m = metres(a, b);
  if (m <= 2000) return Math.max(5, Math.round(m / 80));
  return Math.max(25, Math.ceil((15 + m / 700) / 5) * 5);
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
  // A day camp is the morning's fixed point, drop-off at nine (27 Sep 2026).
  camp:       [{ lo: 8 * 60 + 30, hi: 10 * 60, want: 9 * 60 }],
  // A stay is a check-in, mid-afternoon (27 Sep 2026): Great Wolf Lodge was
  // put at 9:45 on the Friday morning as if it were a sight.
  hotel:         [{ lo: 14 * 60, hi: 19 * 60, want: 15 * 60 }],
  accommodation: [{ lo: 14 * 60, hi: 19 * 60, want: 15 * 60 }],
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

const isFlight = (i: ArrangeItem) => (i.subType ?? "").startsWith("flight");
const isTransit = (i: ArrangeItem) => i.subType === "transit";

/**
 * A port, a station or an airport is where a day turns, not a sight to fit in
 * between (27 Sep 2026, a cruise). It opens the day: you step off the ship or
 * the train and go from there. On the journey's first day the flight opens it
 * and the port closes it (you board in the evening); on the last day the port
 * opens it and the flight home closes it.
 */
export function dayHinges(items: ArrangeItem[], edge?: DayEdge): { opens: ArrangeItem[]; middle: ArrangeItem[]; closes: ArrangeItem[] } {
  const opens = (i: ArrangeItem) => (edge?.first ? isFlight(i) : isTransit(i));
  const closes = (i: ArrangeItem) => (edge?.first ? isTransit(i) : edge?.last ? isFlight(i) : false);
  return {
    opens: items.filter(opens),
    middle: items.filter((i) => !opens(i) && !closes(i)),
    closes: items.filter((i) => !opens(i) && closes(i)),
  };
}

export function arrangeDay(items: ArrangeItem[], busy: Busy[], anchor: Anchor | null, edge?: DayEdge): Arranged {
  const tl = new Timeline(busy);
  const placed: Placed[] = [];
  const unplaced: string[] = [];

  // 1. meals into their slots, first slot first (two restaurants = lunch and dinner)
  const used: Record<string, number> = {};
  // A camp first: it is the day's fixed point, and a gelato must not take its morning.
  const slotted = items.filter(isMeal).sort((x, y) => Number(y.subType === "camp") - Number(x.subType === "camp"));
  for (const it of slotted) {
    const key = it.subType as string;
    const slots = SLOTS[key];
    let start: number | null = null;
    let dur = durationFor(it.type, it.subType);
    for (let k = used[key] ?? 0; k < slots.length && start === null; k++) {
      const s = slots[k];
      // A dinner slot takes a dinner's length.
      const d = durationFor(it.type, it.subType, s.want);
      start = tl.find(s.want, d, s.hi + d) ?? tl.find(s.lo, d, s.hi + d);
      if (start !== null) { used[key] = k + 1; dur = d; }
    }
    if (start === null) { unplaced.push(it.id); continue; }
    tl.take(start, start + dur); placed.push({ id: it.id, startMin: start, endMin: start + dur });
  }

  // 2. everything else: what opens the day, then the sights in walking order
  //    from there, then what closes it, with the travel time between each
  const { opens, middle, closes } = dayHinges(items.filter((i) => !isMeal(i)), edge);
  const opener = [...opens].reverse().find(hasPoint) ?? null;
  const sights = [...opens, ...walkingOrder(middle, opener ?? anchor), ...closes];
  let cursor = DAY_START + 30;
  let placedSights = 0;
  let here: Anchor | null = opens.length ? null : anchor;
  for (const it of sights) {
    const dur = durationFor(it.type, it.subType);
    // The first leg from the anchor counts only when the anchor is near: a
    // day with nothing timed starts from the journey's centre, which on a
    // Europe summer is southern Germany and on any multi-city trip the wrong
    // city — 17 hours to the first London sight, so nothing fit (27 Sep 2026).
    const firstLeg = placedSights === 0 && here === anchor;
    const walk = here && hasPoint(it) && !(firstLeg && metres(here, it) > 100_000) ? travelMinutes(here, it) : 10;
    const from = cursor + walk;
    const start = tl.find(from, dur, 24 * 60);
    if (start === null) { unplaced.push(it.id); continue; }
    tl.take(start, start + dur); placed.push({ id: it.id, startMin: start, endMin: start + dur });
    placedSights++;
    cursor = start + dur;
    if (hasPoint(it)) here = it;
  }

  placed.sort((a, b) => a.startMin - b.startMin);
  return { placed, unplaced };
}
