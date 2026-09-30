/**
 * The pace of a trip (30 Sep 2026). Brennan's rules, in his words: "the day
 * you fly in, you don't do anything because you're tired"; the next day
 * "something close to your home base ... so that by the third day you can do
 * something that's like a day trip"; and "you take a break". Then: "if you
 * have a trip that's a weekend and you want to do something that's really
 * cool or far away (that's the purpose of the trip), you'd have to break this
 * rule". So the pace depends on the trip's length:
 *
 *   up to 4 days  no pace rules; the farthest place goes on the first full day
 *   5–7 days      an easy first day and a day near home, day trips from day 3
 *   8+ days       the first day is for settling in (dinner near home is fine:
 *                 "especially if it's close and really good"), day 2 near
 *                 home, day trips from day 3
 *
 * and a break: never more than 4 busy days in a row with kids, 5 without. Any
 * day with nothing on it counts, so a trip with few places saved is not given
 * extra empty days — Costa Rica as he did it: busy days 2–5, nothing on day 6.
 */

import type { DraftDay } from "./draftTrip";
import { km } from "./dayGroups";

/** Near home: within about half an hour's drive. */
export const NEAR_KM = 25;
/** A weekend's "far" place: out of the neighbourhood (the Natural History Museum, 7 km from SoHo). */
export const WEEKEND_FAR_KM = 5;

export type Pace = "weekend" | "week" | "long";

export function paceOf(dayCount: number): Pace {
  return dayCount <= 4 ? "weekend" : dayCount <= 7 ? "week" : "long";
}

export interface Paced {
  pace: Pace;
  days: DraftDay[];
  /** Days that only take places near home. */
  nearOnly: Set<string>;
  /** Most busy days in a row before a day off. */
  maxRun: number;
  /** A weekend: the farthest place first. */
  farFirst: boolean;
  /** Days off the trip will need, for counting what fits. */
  breaksNeeded: number;
}

/** Apply the trip's pace to the days Plan my trip may fill. */
export function paceDays(days: DraftDay[], kids: boolean): Paced {
  const pace = paceOf(days.length);
  const nearOnly = new Set<string>();
  if (pace === "weekend") return { pace, days, nearOnly, maxRun: Infinity, farFirst: true, breaksNeeded: 0 };
  const maxRun = kids ? 4 : 5;
  const out = days.map((d, i) => {
    if (i === 0 && pace === "long") return { ...d, free: 0 };
    if (i === 0) { nearOnly.add(d.id); return { ...d, free: Math.min(d.free, 0.5) }; }
    if (i === 1) nearOnly.add(d.id);
    return d;
  });
  return { pace, days: out, nearOnly, maxRun, farFirst: false, breaksNeeded: breaksFor(out, maxRun) };
}

/** Days off a run of free days needs: one after every maxRun busy ones. */
export function breaksFor(days: DraftDay[], maxRun: number): number {
  let run = 0, n = 0;
  for (const d of days) {
    if (d.free <= 0) { run = 0; continue; }
    if (run === maxRun) { n++; run = 0; continue; }
    run++;
  }
  return n;
}

/** How long a busy run can go on: true when today must be a day off. */
export function dayOff(run: number, maxRun: number): boolean {
  return run >= maxRun;
}

/** The first night's dinner: close to home and really good. */
export const DINNER_KM = 3;
export const DINNER_RATING = 4.4;
export const DINNER_AT = 18 * 60 + 30;
export const DINNER_MIN = 120;

export interface DinnerChoice { id: string; lat: number | null; lng: number | null; rating: number | null; subType: string | null; open: boolean }

/**
 * On a long trip's settling-in day, one dinner near home if a really good one
 * is saved ("dinner on the first night isn't a big deal ... especially if it's
 * close and really good", 30 Sep 2026). Costa Rica: Pangas Beach Club. None
 * when you land too late to sit down by eight.
 */
export function firstNightDinner(options: DinnerChoice[], home: { lat: number; lng: number } | null, from: number | null): { id: string; start: number; end: number } | null {
  if (!home) return null;
  const start = Math.max(DINNER_AT, from === null ? 0 : Math.ceil(from / 15) * 15);
  if (start > 20 * 60) return null;
  const best = options
    .filter((o) => o.subType === "restaurant" && o.open && o.lat != null && o.lng != null && (o.rating ?? 0) >= DINNER_RATING && km(home, { lat: o.lat!, lng: o.lng! }) <= DINNER_KM)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || km(home, { lat: a.lat!, lng: a.lng! }) - km(home, { lat: b.lat!, lng: b.lng! }))[0];
  return best ? { id: best.id, start, end: start + DINNER_MIN } : null;
}
