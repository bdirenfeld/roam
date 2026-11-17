/**
 * The hotel picker's rules (17 Nov 2026, approved mock): one calendar, the way
 * hotel apps do it. Tap the check-in day, then the check-out day; the nights
 * between fill in. A night another hotel already covers carries a dot.
 */

import { addDays, type StayRun } from "@/lib/stays/stayRuns";

export interface StayPick { checkIn: string | null; checkOut: string | null }

/**
 * A tap on `date`. Nothing picked, or both picked: start again at this day.
 * A day on or before check-in moves check-in there. A later day is check-out.
 */
export function tapDay(p: StayPick, date: string): StayPick {
  if (!p.checkIn || p.checkOut) return { checkIn: date, checkOut: null };
  if (date <= p.checkIn) return { checkIn: date, checkOut: null };
  return { checkIn: p.checkIn, checkOut: date };
}

/** Whole nights from check-in to check-out; 0 when either is missing. */
export function nightsOf(p: StayPick): number {
  if (!p.checkIn || !p.checkOut) return 0;
  return Math.round((Date.parse(p.checkOut) - Date.parse(p.checkIn)) / 86_400_000);
}

/** Night dates (YYYY-MM-DD) that OTHER hotels cover, with the hotel's name. */
export function otherStayNights(runs: StayRun[], placeId: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of runs) {
    if (placeId && r.placeId === placeId) continue;
    for (let d = r.checkIn; d < r.checkOut; d = addDays(d, 1)) out[d] = r.title;
  }
  return out;
}

/** Which days can be tapped: check-in must be a day of the journey; check-out may be its last day. */
export const selectable = (date: string, start: string, end: string): boolean => date >= start && date <= end;
