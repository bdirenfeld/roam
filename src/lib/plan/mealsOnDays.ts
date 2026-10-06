/**
 * Saved food onto days that are already planned (3 Oct 2026). Plan my trip
 * only added meals as part of a NEW day's group (./dayGroups), so once every
 * day had a sight on it, saved coffee and restaurants could never be planned:
 * Muskoka had Santa's Village, Treetop Trekking and Dwight Beach on its days,
 * and the sheet said "No room for what's left" for two Huntsville cafés and a
 * Bracebridge restaurant. Meals take no day time; they need a slot, not a day.
 *
 * Rules, deterministic:
 * - A meal goes on the nearest day with a sight within NEAR_KM of it (planned
 *   days are driving days: Treetop Trekking is 5 km from Huntsville's cafés,
 *   Santa's Village 4 km from the Old Station).
 * - Coffee (anything that is not a restaurant) is the morning: 45 minutes,
 *   ending a quarter of an hour before the day's first fixed card, never
 *   before 8. A restaurant is lunch (12:00) when nothing is booked over it,
 *   else dinner (18:00, or after the day's last card, by 8 pm). Bars are left
 *   to the evening rule elsewhere.
 * - One coffee, one lunch, one dinner a day, counting food already on it.
 * - Inside the place's opening hours that day; nothing on top of a timed card.
 * - What cannot go anywhere comes back with a plain reason for the sheet.
 */

import { km } from "./dayGroups";
import { GAP_MIN, type Window } from "./retime";
import { shortDay } from "@/lib/confirmations/outsideDates";

export const NEAR_KM = 8;
const COFFEE_MIN = 45;
const MEAL_MIN = 75;
const DINNER_MIN = 90;
const EARLIEST = 8 * 60;
const LUNCH_AT = 12 * 60;
const DINNER_FROM = 18 * 60;
const DINNER_LATEST = 20 * 60;

export type Slot = "coffee" | "lunch" | "dinner";

export interface MealCandidate {
  id: string;
  title: string;
  subType: string | null;
  lat: number;
  lng: number;
  /** The place's hours on a date: a window, "closed", or null when unknown. */
  windowOn: (date: string) => Window | "closed" | null;
}

export interface PlannedDay {
  id: string;
  date: string;
  /** Located sights on the day (already there or just planned). */
  sights: { lat: number; lng: number; title: string }[];
  /** Timed cards and airport bounds, minutes after midnight. */
  busy: { start: number; end: number }[];
  /** Meal slots already taken by food on the day. */
  taken: Slot[];
}

export interface MealPlaced { id: string; dayId: string; slot: Slot; start: number; end: number; near: string }
/** `why`: "full" = every near day already has that meal (or no time for it); "closed" / "far" otherwise. */
export interface MealLeft { id: string; title: string; reason: string; why: "full" | "closed" | "far" }

const overlaps = (s: number, e: number, busy: { start: number; end: number }[]) => busy.some((b) => s < b.end + GAP_MIN && e + GAP_MIN > b.start);
const inside = (s: number, e: number, w: Window | null) => !w || (s >= w.open && e <= w.close);

/** The meal's time on a day, or null when there is none. */
function slotOn(m: MealCandidate, day: PlannedDay, w: Window | null): { slot: Slot; start: number; end: number } | null {
  const restaurant = m.subType === "restaurant";
  if (!restaurant) {
    if (day.taken.includes("coffee")) return null;
    const first = day.busy.length ? Math.min(...day.busy.map((b) => b.start)) : 10 * 60;
    let end = first - GAP_MIN;
    if (w) end = Math.min(end, w.close);
    let start = end - COFFEE_MIN;
    if (w && start < w.open) { start = w.open; end = start + COFFEE_MIN; }
    if (start < EARLIEST || end > first - GAP_MIN || overlaps(start, end, day.busy) || !inside(start, end, w)) return null;
    return { slot: "coffee", start, end };
  }
  if (!day.taken.includes("lunch")) {
    const s = LUNCH_AT, e = s + MEAL_MIN;
    if (!overlaps(s, e, day.busy) && inside(s, e, w)) return { slot: "lunch", start: s, end: e };
  }
  if (!day.taken.includes("dinner")) {
    const after = day.busy.filter((b) => b.end > 15 * 60 && b.start < 22 * 60).reduce((x, b) => Math.max(x, b.end + 2 * GAP_MIN), DINNER_FROM);
    const s = Math.ceil(after / 15) * 15, e = s + DINNER_MIN;
    if (s <= DINNER_LATEST && !overlaps(s, e, day.busy) && inside(s, Math.min(e, w?.close ?? e), w) && (!w || w.close - s >= 60)) {
      return { slot: "dinner", start: s, end: w ? Math.min(e, w.close) : e };
    }
  }
  return null;
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function mealsOnPlannedDays(meals: MealCandidate[], days: PlannedDay[]): { placed: MealPlaced[]; left: MealLeft[] } {
  const state = days.map((d) => ({ ...d, busy: [...d.busy], taken: [...d.taken] }));
  const near = (m: MealCandidate) => state
    .map((d) => ({ d, dist: Math.min(Infinity, ...d.sights.map((s) => km(s, m))), by: d.sights.slice().sort((a, b) => km(a, m) - km(b, m))[0] }))
    .filter((x) => x.dist <= NEAR_KM)
    .sort((a, b) => a.dist - b.dist || a.d.date.localeCompare(b.d.date));
  // The closest pairs first, so a café beside a sight gets that morning.
  const order = [...meals].sort((a, b) => (near(a)[0]?.dist ?? Infinity) - (near(b)[0]?.dist ?? Infinity) || a.title.localeCompare(b.title));
  const placed: MealPlaced[] = [];
  const left: MealLeft[] = [];
  for (const m of order) {
    const options = near(m);
    if (!options.length) { left.push({ id: m.id, title: m.title, reason: "No planned day goes near it.", why: "far" }); continue; }
    let done = false;
    const closed: string[] = [], full: string[] = [];
    for (const { d, by } of options) {
      const w = m.windowOn(d.date);
      if (w === "closed") { closed.push(shortDay(d.date)); continue; }
      const t = slotOn(m, d, w);
      if (!t) { full.push(shortDay(d.date)); continue; }
      placed.push({ id: m.id, dayId: d.id, slot: t.slot, start: t.start, end: t.end, near: by.title });
      d.busy.push({ start: t.start, end: t.end });
      d.taken.push(t.slot);
      done = true;
      break;
    }
    if (done) continue;
    const what = m.subType === "restaurant" ? "a lunch and a dinner, or no time for them" : "a coffee, or no time before the day starts";
    const reason = closed.length && !full.length
      ? `It's closed on ${list(closed)}, the ${closed.length === 1 ? "only day" : "days"} near it.`
      : closed.length
        ? `It's closed on ${list(closed)}, and ${list(full)} already ${full.length === 1 ? "has" : "have"} ${what}.`
        : `${list(full)} already ${full.length === 1 ? "has" : "have"} ${what}.`;
    left.push({ id: m.id, title: m.title, reason, why: closed.length ? "closed" : "full" });
  }
  return { placed, left };
}

/** Which slot food already on a day takes, from its start time. */
export function slotOfTime(start: number | null, subType: string | null): Slot {
  if (subType !== "restaurant") return start !== null && start >= 15 * 60 ? "dinner" : "coffee";
  return start !== null && start >= 15 * 60 ? "dinner" : "lunch";
}

/** "Coffee", "Lunch", "Dinner". */
export const slotWord = (s: Slot) => (s === "coffee" ? "Coffee" : s === "lunch" ? "Lunch" : "Dinner");

/**
 * The food that stays saved, as ONE line (6 Oct 2026, designer audit). On a
 * planned journey the sheet printed a sentence per place — six near-identical
 * "X stays saved. Sat 28 Aug already has a lunch and a dinner…" lines. Now:
 * "6 food places stay saved: those days already have their meals." with the
 * names behind "See which". The reason is only claimed when it is true of every
 * place; otherwise the line stops at "stay saved." and each name keeps its own
 * reason when opened. One place keeps its full sentence (it is one line already).
 */
export function leftLine(left: MealLeft[]): { line: string; allFull: boolean } | null {
  if (left.length < 2) return null;
  const allFull = left.every((m) => m.why === "full");
  return {
    line: `${left.length} food places stay saved${allFull ? ": those days already have their meals." : "."}`,
    allFull,
  };
}
