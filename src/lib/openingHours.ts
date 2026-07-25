// Opening-hours conflict signal for scheduled cards.
//
// A card is scheduled at a place with known opening hours. This helper decides
// whether the scheduled time is a *problem* worth surfacing on the tile — and
// stays silent otherwise. It never renders an always-on hours line; the caller
// shows a caption only when this returns a non-null signal.
//
// Input `hours` is the raw Google legacy `opening_hours` object as persisted on
// `places.hours` (verified against production — `periods[].open.{day,time}`,
// day 0=Sunday…6=Saturday, time as a 4-char local string like "1000"). We read
// `periods` only; `weekday_text` is the bottom sheet's concern.
//
// TIMEZONE ASSUMPTION: Google's times are in the PLACE's local time and the
// card's start_time is assumed to be in that same timezone. v1 does no timezone
// conversion — a cross-timezone card can read as fitting when it does not.

import { formatTimeValue } from "@/lib/formatTime";

export type OpeningHoursSignal =
  // Scheduled before the place opens that weekday. `opensAt` is "HH:MM".
  | { kind: "opens"; opensAt: string }
  // Place has hours, but is closed on the scheduled weekday. `weekday` is the
  // full name, e.g. "Saturday" (the caller pluralizes: "Closed Saturdays").
  | { kind: "closed"; weekday: string };

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A single valid opening period, normalized. */
type ValidPeriod = { day: number; time: string };

/** Normalize Google's 4-char local time ("1000") to "HH:MM" ("10:00"). */
function normalizeGoogleTime(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) return null;
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

/** Extract only well-formed opening periods from the raw hours object. */
function readValidPeriods(hours: unknown): ValidPeriod[] {
  if (typeof hours !== "object" || hours === null) return [];
  const periods = (hours as { periods?: unknown }).periods;
  if (!Array.isArray(periods)) return [];

  const valid: ValidPeriod[] = [];
  for (const period of periods) {
    if (typeof period !== "object" || period === null) continue;
    const open = (period as { open?: unknown }).open;
    if (typeof open !== "object" || open === null) continue;
    const day = (open as { day?: unknown }).day;
    const time = normalizeGoogleTime((open as { time?: unknown }).time);
    if (typeof day !== "number" || day < 0 || day > 6 || time === null) continue;
    valid.push({ day, time });
  }
  return valid;
}

/** Resolve a "YYYY-MM-DD" calendar date to a weekday index (0=Sun…6=Sat). */
function weekdayIndex(dayDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayDate);
  if (!match) return null;
  const [, y, m, d] = match;
  // Explicit components → deterministic local date (NOT `new Date()` / "now").
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

/**
 * Decide the opening-hours conflict signal for a scheduled card, or null to
 * stay silent. Silent when: no start_time (nothing to compare), no date
 * (cannot resolve the weekday), a note card / missing / malformed hours, no
 * usable periods (unknown), or the scheduled time fits the day's hours.
 */
export function getOpeningHoursConflict(
  hours: unknown,
  dayDate: string | null,
  startTime: string | null,
): OpeningHoursSignal | null {
  // No scheduled time → nothing to compare against; do not invent one.
  if (!startTime) return null;
  // No date → cannot resolve the weekday (day_id is nullable in production).
  if (!dayDate) return null;

  const periods = readValidPeriods(hours);
  // No usable periods at all → hours are unknown, not "closed". Stay silent.
  if (periods.length === 0) return null;

  const weekday = weekdayIndex(dayDate);
  if (weekday === null) return null;

  const todays = periods.filter((p) => p.day === weekday);

  // Has real periods, but none for this weekday → genuinely closed today.
  if (todays.length === 0) {
    return { kind: "closed", weekday: WEEKDAY_NAMES[weekday] };
  }

  // Earliest opening time for the weekday; string compare works on "HH:MM".
  const opensAt = todays.reduce((min, p) => (p.time < min ? p.time : min), todays[0].time);
  const start = startTime.slice(0, 5); // "HH:MM:SS" → "HH:MM"

  return start < opensAt ? { kind: "opens", opensAt } : null;
}

/**
 * Render the signal to its caption string, formatted through formatTime.ts:
 *   opens  → "Opens 10:00 AM"
 *   closed → "Closed Saturdays"
 */
export function openingHoursCaption(signal: OpeningHoursSignal): string {
  if (signal.kind === "opens") return `Opens ${formatTimeValue(signal.opensAt)}`;
  return `Closed ${signal.weekday}s`;
}
