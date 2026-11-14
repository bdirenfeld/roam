/**
 * When a trip added by hand should leave (Brennan, 14 Nov 2026, "Add travel"):
 * worked back from the stop it is going to, so he never guesses a time.
 *
 *   1. A timed stop on the day at or near where you are going (within 1.5 km):
 *      arrive by its start. "Arrive by 9:15 for Lucca Wandering."
 *   2. Otherwise, after the day's last timed stop ends: "After lunch at Ciacco."
 *   3. A day with nothing timed: 9:00 AM.
 *
 * Times are "HH:MM" on the 24-hour clock; minutes round to five like the end
 * time a travel-time tap sets (planMinutes).
 */

import { planMinutes } from "@/lib/travel/estimate";

export interface DayStop {
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LeavePlan {
  /** "HH:MM" */
  leave: string;
  /** "HH:MM", or null when the length of the trip is unknown. */
  arrive: string | null;
  /** The stop the time came from, for the line under it. */
  why: { kind: "arrive_by" | "after"; title: string; at: string } | null;
}

const NEAR_KM = 1.5;
const DEFAULT_LEAVE = "09:00";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => {
  const w = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(w / 60), r = w % 60;
  return `${h < 10 ? "0" : ""}${h}:${r < 10 ? "0" : ""}${r}`;
};
const hhmm = (t: string) => t.slice(0, 5);

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function planLeave(stops: DayStop[], to: { lat: number; lng: number }, minutes: number | null): LeavePlan {
  const mins = minutes != null && minutes > 0 ? planMinutes(minutes) : null;
  // The day's timed stops, each with its start in minutes. No sort: the day's
  // order is lib/agendaOrder's alone; this only needs the earliest nearby one.
  const timed = stops.filter((s) => !!s.start_time);
  let target: DayStop | null = null;
  let targetAt = Infinity;
  for (const s of timed) {
    const at = toMin(s.start_time!);
    if (s.lat != null && s.lng != null && km({ lat: s.lat, lng: s.lng }, to) <= NEAR_KM && at < targetAt) { target = s; targetAt = at; }
  }
  if (target) {
    const at = hhmm(target.start_time!);
    const leave = mins != null ? fromMin(Math.max(0, toMin(at) - mins)) : at;
    return { leave, arrive: mins != null ? at : null, why: { kind: "arrive_by", title: target.title ?? "your next stop", at } };
  }

  let last: DayStop | null = null;
  let lastEnd = -1;
  for (const s of timed) {
    const end = toMin(s.end_time ?? s.start_time!);
    if (end >= lastEnd) { lastEnd = end; last = s; }
  }
  if (last) {
    const at = fromMin(lastEnd);
    return { leave: at, arrive: mins != null ? fromMin(lastEnd + mins) : null, why: { kind: "after", title: last.title ?? "your last stop", at } };
  }

  return { leave: DEFAULT_LEAVE, arrive: mins != null ? fromMin(toMin(DEFAULT_LEAVE) + mins) : null, why: null };
}

/** A leave time typed by hand: the arrival follows it. */
export function withLeave(leave: string, minutes: number | null): LeavePlan {
  const mins = minutes != null && minutes > 0 ? planMinutes(minutes) : null;
  const l = hhmm(leave);
  return { leave: l, arrive: mins != null ? fromMin(toMin(l) + mins) : null, why: null };
}
