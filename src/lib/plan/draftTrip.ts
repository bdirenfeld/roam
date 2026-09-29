/**
 * Put day groups on a journey's days (28 Sep 2026, "Plan my trip"). Pure:
 * which group goes on which day; the day planner (lib/week/dayPlan) gives the
 * times and the caller writes the draft.
 *
 * - A day already holding a sightseeing plan is taken. A day with only a
 *   flight on it (arriving, going home) has half a day free.
 * - Regions run one after another, nearest next, starting from the stay or
 *   the airport; the first day in a new region is a travel day with half a
 *   day free.
 * - A group never lands on a weekday one of its places is closed; the next
 *   group that is open that day goes instead.
 * - Groups that do not fit are handed back, never squeezed in.
 */

import { km, type DayGroup, type Grouping, type Pin } from "./dayGroups";
import { townFromAddress } from "@/lib/stays/brief";

export interface DraftDay {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Share of the day still free: 1, 0.5 (a flight on it) or 0 (already planned). */
  free: number;
}

export interface Placement { dayId: string; group: DayGroup }

/** Monday-first weekday index of a date, matching DayGroup.openDays. */
export function weekdayOf(date: string): number {
  return (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
}

const pointOf = (g: DayGroup) => g.centre;

function nearestFirst<T>(items: T[], at: (t: T) => { lat: number; lng: number }, from: { lat: number; lng: number } | null): T[] {
  const left = [...items];
  const out: T[] = [];
  let here = from;
  while (left.length) {
    let k = 0;
    if (here) {
      let best = Infinity;
      left.forEach((t, i) => { const d = km(here!, at(t)); if (d < best) { best = d; k = i; } });
    }
    const [next] = left.splice(k, 1);
    out.push(next);
    here = at(next);
  }
  return out;
}

/**
 * The order to visit places that adds the least travel, ending back where it
 * began — the flight home usually leaves from where you landed. Nearest-next
 * left the far one for last: Japan went Tokyo, Izu, Kanazawa, Osaka and then
 * 600 km to Yamagata on the final day (29 Sep 2026). Exact up to 8 stops;
 * nearest-next beyond that.
 */
export function roundTrip<T>(items: T[], at: (t: T) => { lat: number; lng: number }, from: { lat: number; lng: number } | null): T[] {
  if (items.length <= 2 || items.length > 8 || !from) return nearestFirst(items, at, from);
  // The place you start is first; the rest are ordered after it.
  let k0 = 0;
  items.forEach((t, i) => { if (km(at(t), from) < km(at(items[k0]), from)) k0 = i; });
  const first = items[k0];
  const rest = [...items.slice(0, k0), ...items.slice(k0 + 1)];
  let best: T[] = items, cost = Infinity;
  const walk = (path: T[], left: T[], sofar: number) => {
    if (sofar >= cost) return;
    if (!left.length) {
      // Two directions round a loop cost the same: end nearer home.
      // The loop closes where it began (the first region), so both directions cost the same.
      const last = km(at(path[path.length - 1]), at(first));
      const total = sofar + last * 1.001;
      if (total < cost) { cost = total; best = path; }
      return;
    }
    const here = path.length ? at(path[path.length - 1]) : from;
    left.forEach((t, i) => walk([...path, t], [...left.slice(0, i), ...left.slice(i + 1)], sofar + km(here, at(t))));
  };
  walk([first], rest, km(from, at(first)));
  return best;
}

export function placeGroups(
  grouping: Grouping,
  days: DraftDay[],
  opts: { regions?: number[]; start?: { lat: number; lng: number } | null } = {},
): { placed: Placement[]; unplaced: DayGroup[] } {
  const chosen = new Set(opts.regions ?? grouping.regions.map((r) => r.id));
  const regions = grouping.regions.filter((r) => chosen.has(r.id) && r.days > 0);
  // With no stay or airport to start from, begin where most of the days are.
  const start = opts.start ?? [...regions].sort((a, b) => b.days - a.days)[0]?.centre ?? null;
  const order = roundTrip(regions, (r) => r.centre, start);

  const queue: DayGroup[][] = [];
  let here = start;
  for (const r of order) {
    const mine = grouping.groups.filter((g) => g.region === r.id);
    // Full days first in a region, so a travel day's half is left for a short one.
    const ordered = nearestFirst(mine, pointOf, here).sort((a, b) => (b.load >= 1 ? 1 : 0) - (a.load >= 1 ? 1 : 0));
    queue.push(ordered);
    here = r.centre;
  }

  const placed: Placement[] = [];
  const unplaced: DayGroup[] = grouping.groups.filter((g) => !chosen.has(g.region));

  // Spare days are spread through the trip as free days, not all left at the
  // end: Costa Rica came out as five full days and then four empty ones.
  const usable = days.filter((d) => d.free > 0);
  const needed = queue.reduce((s, q) => s + q.length, 0);
  const spare = usable.length - needed;
  const rest = new Set<string>();
  if (spare > 0) {
    for (let k = 1; k <= spare; k++) rest.add(usable[Math.min(usable.length - 1, Math.round((k * usable.length) / (spare + 1)))].id);
  }

  let ri = 0;
  let arrived = false;
  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    while (ri < queue.length && queue[ri].length === 0) { ri++; arrived = false; }
    if (ri >= queue.length) break;
    if (day.free <= 0 || rest.has(day.id)) continue;
    // The first day in a region after the first one is spent getting there.
    const free = !arrived && ri > 0 ? Math.min(day.free, 0.5) : day.free;
    arrived = true;
    const wd = weekdayOf(day.date);
    // Of what is open today and fits, the place open on the fewest days goes
    // first: DisneySea (every day) took Tokyo's Sunday and left no weekend for
    // the stamp shop, open Saturdays and Sundays only (29 Sep 2026).
    let k = -1, fewest = 8;
    queue[ri].forEach((g, j) => {
      if (g.openDays[wd] !== "1" || Math.min(g.load, 1) > free + 1e-9) return;
      const n = g.openDays.split("").filter((c) => c === "1").length;
      if (n < fewest) { fewest = n; k = j; }
    });
    if (k >= 0) {
      const [g] = queue[ri].splice(k, 1);
      placed.push({ dayId: day.id, group: g });
      continue;
    }
    // Nothing here is open today. Wait a day if something opens tomorrow;
    // otherwise what is left is closed while you are here (the stamp shop,
    // weekends only) and goes back to you, and the trip moves on today.
    const tomorrow = (wd + 1) % 7;
    if (queue[ri].some((g) => g.openDays[tomorrow] === "1") || queue[ri].every((g) => Math.min(g.load, 1) > free + 1e-9)) continue;
    unplaced.push(...queue[ri].splice(0));
    di--;
  }
  for (const q of queue) unplaced.push(...q);
  return { placed, unplaced };
}

/** A region's name: the town most of its places are in. */
export function regionLabel(pins: Pin[]): string | null {
  const count = new Map<string, number>();
  for (const p of pins) {
    const t = townFromAddress(p.address ?? null);
    if (t) count.set(t, (count.get(t) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  count.forEach((c, t) => { if (c > n) { best = t; n = c; } });
  return best;
}

/** Days free for a draft: the capacity placeGroups will fill. */
export function freeDays(days: DraftDay[]): number {
  return days.reduce((s, d) => s + d.free, 0);
}
