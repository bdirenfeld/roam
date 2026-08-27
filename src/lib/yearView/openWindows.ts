// ── Open windows ──────────────────────────────────────────────────────────
// "When could we actually go?" — school breaks and 3+ day weekends from the
// TDSB calendar, plus Brennan's own saved ideal windows, minus anything a
// journey already covers.
//
// This lived inside YearView until the new-journey date picker needed the
// same answer for its quick chips. Moved here verbatim so both callers see
// one definition; YearView's rendering is unchanged.

import { SCHOOL_CALENDAR } from "@/lib/yearView/schoolCalendar";

// ── Date helpers (date-only, local — matches tripRecency's approach) ──────
export const DAY_MS = 24 * 60 * 60 * 1000;
export const parseDate = (iso: string) => new Date(iso + "T00:00:00");
export const isoOf = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
export const addDays = (dt: Date, n: number) =>
  new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
export const isWeekend = (dt: Date) => dt.getDay() === 0 || dt.getDay() === 6;
export const daysBetweenInclusive = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
export const maxDate = (a: Date, b: Date) => (a > b ? a : b);

export interface OpenWindow {
  key: string;
  name: string; // "March break", "Family Day", "PA day", or an ideal window's label
  kind: "break" | "weekend" | "ideal";
  coreStart: Date; // printed range (the break / long weekend itself)
  coreEnd: Date;
  start: Date; // extended with adjacent weekends — pill + overlap math
  end: Date;
  days: number; // inclusive days of the extended range
}

// Brennan's own "ideal times to travel" (public.travel_windows)
export interface TravelWindowRow {
  id: string;
  label: string | null;
  start_date: string;
  end_date: string;
}

// The only trip fields the computation reads. `archived` is optional so a
// caller that doesn't select the column behaves like YearView does for an
// unarchived journey.
export interface OpenWindowTrip {
  start_date: string;
  end_date: string;
  archived?: boolean;
}

interface Args {
  trips: OpenWindowTrip[];
  travelWindows: TravelWindowRow[];
  /** Today, date-only local. */
  todayD: Date;
  /** Last day of the rolling planning window. */
  winEnd: Date;
}

export function computeOpenWindows({ trips, travelWindows, todayD, winEnd }: Args): OpenWindow[] {
  const activeTrips = trips.filter((t) => !t.archived && t.start_date && t.end_date);
  const overlapsTrip = (start: Date, end: Date) =>
    activeTrips.some(
      (t) => parseDate(t.start_date) <= end && parseDate(t.end_date) >= start
    );

  // Off-days that can chain onto a weekend: PA days + stat holidays
  const singles = SCHOOL_CALENDAR.filter((e) => e.kind === "pa" || e.kind === "stat");
  const offSet = new Set(singles.map((e) => e.start));
  const isOff = (dt: Date) => isWeekend(dt) || offSet.has(isoOf(dt));
  const breaks = SCHOOL_CALENDAR.filter((e) => e.kind === "break");

  const found: OpenWindow[] = [];

  // (a) School breaks with no journey overlapping (weekends folded in)
  for (const b of breaks) {
    const bStart = parseDate(b.start);
    const bEnd = parseDate(b.end);
    if (bEnd < todayD || bStart > winEnd) continue;
    let extStart = bStart;
    while (isOff(addDays(extStart, -1))) extStart = addDays(extStart, -1);
    let extEnd = bEnd;
    while (isOff(addDays(extEnd, 1))) extEnd = addDays(extEnd, 1);
    if (overlapsTrip(extStart, extEnd)) continue;
    // A break already underway only offers its remaining days
    const start = maxDate(extStart, todayD);
    found.push({
      key: `break-${b.start}`,
      name: `${b.label} break`,
      kind: "break",
      coreStart: maxDate(bStart, todayD),
      coreEnd: bEnd,
      start,
      end: extEnd,
      days: daysBetweenInclusive(start, extEnd),
    });
  }

  // (b) PA days / stats that chain with a weekend into a 3+ day block
  const seen = new Set<string>();
  for (const s of singles) {
    const d0 = parseDate(s.start);
    if (d0 < todayD || d0 > winEnd) continue;
    // Skip days swallowed by a break (e.g. Labour Day inside summer)
    if (breaks.some((b) => d0 >= parseDate(b.start) && d0 <= parseDate(b.end))) continue;
    let runStart = d0;
    while (isOff(addDays(runStart, -1))) runStart = addDays(runStart, -1);
    let runEnd = d0;
    while (isOff(addDays(runEnd, 1))) runEnd = addDays(runEnd, 1);
    const days = daysBetweenInclusive(runStart, runEnd);
    if (days < 3) continue;
    const key = `run-${isoOf(runStart)}`;
    if (seen.has(key)) continue; // Fri PA + Mon stat share one run
    seen.add(key);
    if (overlapsTrip(runStart, runEnd)) continue;
    // Name the run after its stat holiday when it has one. The only run
    // holding two stats in an Ontario school year is Good Friday + Easter
    // Monday — call that one "Easter" rather than picking a side.
    const statsInRun = singles.filter((e) => {
      const ed = parseDate(e.start);
      return e.kind === "stat" && ed >= runStart && ed <= runEnd;
    });
    found.push({
      key,
      name:
        statsInRun.length >= 2 ? "Easter" : statsInRun[0] ? statsInRun[0].label : "PA day",
      kind: "weekend",
      coreStart: runStart,
      coreEnd: runEnd,
      start: runStart,
      end: runEnd,
      days,
    });
  }

  // (c) Brennan's own ideal windows with no journey booked over them
  for (const w of travelWindows) {
    const wStart = parseDate(w.start_date);
    const wEnd = parseDate(w.end_date);
    if (wEnd < todayD || wStart > winEnd) continue;
    if (overlapsTrip(wStart, wEnd)) continue;
    const start = maxDate(wStart, todayD);
    found.push({
      key: `ideal-${w.id}`,
      name: w.label || "Ideal window",
      kind: "ideal",
      coreStart: start,
      coreEnd: wEnd,
      start,
      end: wEnd,
      days: daysBetweenInclusive(start, wEnd),
    });
  }

  // Soonest first, uncapped — every open window in the rolling 12 months
  // renders (a cap here once hid March break behind the fall windows)
  found.sort((a, b) => a.start.getTime() - b.start.getTime());
  return found;
}
