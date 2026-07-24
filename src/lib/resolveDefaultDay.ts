// Roam — resolve which day to open when *entering* a journey.
//
// Entering a journey (from the journeys list, the trip root redirect, or a
// guest invite link) should land on the day that matches today — not always
// Day 1. This is the single source of that logic, so no entry point
// duplicates it: today's calendar date, clamped to the journey's range.
//   • today before the journey → the first day
//   • today within the journey → the day whose date is today
//   • today after the journey  → the last day
//
// Calendar dates only, no time-of-day. `today` defaults to the local "now"
// (browser-local on the client; the host clock in a server context, which is
// the closest a server-side redirect can get to browser-local).
//
// Applies ONLY to entering a journey. Day tabs, direct day URLs, and back
// navigation never call this — they must never redirect.

interface DayLike {
  id: string;
  date: string; // "YYYY-MM-DD"
}

// Local calendar date as "YYYY-MM-DD". Deliberately not toISOString(), which
// converts to UTC and can land on the wrong calendar day near midnight.
function toCalendarDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveDefaultDay<T extends DayLike>(
  days: T[],
  today: Date = new Date(),
): T | null {
  if (days.length === 0) return null;

  // Sort a copy by calendar date so first/last are unambiguous no matter the
  // order the caller fetched in. "YYYY-MM-DD" strings sort chronologically.
  const sorted = [...days].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const todayStr = toCalendarDate(today);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (todayStr <= first.date) return first; // before the journey, or on day one
  if (todayStr >= last.date) return last; // after the journey, or on the last day

  // Inside the range: the day whose date is today. For consecutive dates that
  // is an exact match; walking to the last day on or before today keeps it
  // robust should the dates ever have a gap.
  let match = first;
  for (const d of sorted) {
    if (d.date <= todayStr) match = d;
    else break;
  }
  return match;
}
