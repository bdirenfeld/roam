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
import { NEAR_KM, WEEKEND_FAR_KM, dayOff } from "./pace";

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
  opts: { regions?: number[]; start?: { lat: number; lng: number } | null; nearOnly?: Set<string>; farFirst?: boolean; maxRun?: number } = {},
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

  const unplaced: DayGroup[] = grouping.groups.filter((g) => !chosen.has(g.region));

  // Spare days are spread through the trip as free days, not all left at the
  // end: Costa Rica came out as five full days and then four empty ones.
  const usable = days.filter((d) => d.free > 0);
  const needed = queue.reduce((s, q) => s + q.length, 0);
  // What is spare once travel is counted: a move between regions and the
  // first and last days hold only half a day, so a full-day group needs a
  // full day. Counting every day as whole kept four rest days on Japan and
  // left Kanazawa out (29 Sep 2026).
  const moves = Math.max(0, queue.filter((q) => q.length).length - 1);
  const fullDays = usable.filter((d) => d.free >= 1).length - moves;
  const halfDays = usable.length - usable.filter((d) => d.free >= 1).length + moves;
  const big = queue.reduce((s, q) => s + q.filter((g) => Math.min(g.load, 1) > 0.5).length, 0);
  const spare = Math.min(fullDays - big, fullDays + halfDays - needed);
  // Rest days are given up one at a time while anything does not fit: a
  // spread-out rest day is worth less than a place you saved.
  // A weekend's big thing: the group farthest from home, if it is out of the
  // neighbourhood. New York left the Natural History Museum saved: 32 places
  // for three and a half days, planned nearest first (30 Sep 2026).
  let weekendBig: DayGroup | null = null;
  if (opts.farFirst && start) {
    let most = WEEKEND_FAR_KM;
    for (const g of queue.flat()) { const d = km(g.centre, start); if (d > most) { most = d; weekendBig = g; } }
  }
  const run = (restCount: number) => {
    const rest = new Set<string>();
    for (let k = 1; k <= restCount; k++) rest.add(usable[Math.min(usable.length - 1, Math.round((k * usable.length) / (restCount + 1)))].id);
    const q = queue.map((x) => [...x]);
    const placed: Placement[] = [];
    const dropped: DayGroup[] = [];
    let ri = 0;
    let arrived = false;
    // Busy days in a row (./pace): a day off after maxRun of them; any day
    // with nothing on it counts as one.
    let busy = 0;
    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      while (ri < q.length && q[ri].length === 0) { ri++; arrived = false; }
      if (ri >= q.length) break;
      if (day.free <= 0 || rest.has(day.id) || dayOff(busy, opts.maxRun ?? Infinity)) { busy = 0; continue; }
      // The first day in a region after the first one is spent getting there.
      const free = !arrived && ri > 0 ? Math.min(day.free, 0.5) : day.free;
      arrived = true;
      const wd = weekdayOf(day.date);
      // Of what is open today and fits, the place open on the fewest days goes
      // first: DisneySea (every day) took Tokyo's Sunday and left no weekend for
      // the stamp shop, open Saturdays and Sundays only (29 Sep 2026).
      // The trip's pace (./pace): some days take only places near home; on a
      // weekend the farthest place, likely the reason for the trip, goes first.
      const far = (g: DayGroup) => !!start && km(g.centre, start) > NEAR_KM;
      const near = opts.nearOnly?.has(day.id) ?? false;
      let k = -1, fewest = 99;
      q[ri].forEach((g, j) => {
        if (g.openDays[wd] !== "1" || Math.min(g.load, 1) > free + 1e-9) return;
        if (near && far(g)) return;
        const n = g.openDays.split("").filter((c) => c === "1").length - (g === weekendBig ? 10 : 0);
        if (n < fewest) { fewest = n; k = j; }
      });
      if (k < 0 && near) { busy = 0; continue; }
      if (k >= 0) {
        const [g] = q[ri].splice(k, 1);
        placed.push({ dayId: day.id, group: g });
        busy++;
        continue;
      }
      // Nothing here is open today. Wait a day if something opens tomorrow;
      // otherwise what is left is closed while you are here (the stamp shop,
      // weekends only) and goes back to you, and the trip moves on today.
      // Any day left, not just tomorrow: Palo Verde open Thursdays and Sundays
      // was dropped on a Friday once day 2 became a near-home day (30 Sep 2026).
      const later = days.slice(di + 1).filter((d) => d.free > 0 && !rest.has(d.id)).map((d) => weekdayOf(d.date));
      if (q[ri].some((g) => later.some((w) => g.openDays[w] === "1")) || q[ri].every((g) => Math.min(g.load, 1) > free + 1e-9)) { busy = 0; continue; }
      dropped.push(...q[ri].splice(0));
      di--;
    }
    const left = q.flat();
    return { placed, dropped, left };
  };
  // Out counts what was dropped as closed too: a rest day on the one Sunday
  // Palo Verde opens drops it, and fewer rest days would have kept it.
  const out = (x: { dropped: DayGroup[]; left: DayGroup[] }) => x.dropped.length + x.left.length;
  let best = run(Math.max(0, spare));
  for (let r = Math.max(0, spare) - 1; r >= 0 && out(best) > 0; r--) {
    const next = run(r);
    if (out(next) < out(best)) best = next;
  }
  unplaced.push(...best.dropped, ...best.left);
  return { placed: best.placed, unplaced };
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
