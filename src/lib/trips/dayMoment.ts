/**
 * The one quiet line at the top of the phone's day on the first and last day
 * of a journey (7 Oct 2026, delight audit): "Day 1 in Irving · have a great
 * trip" on the first day, "Last day in Irving" on the last, null otherwise —
 * days in between, before and after the trip say nothing.
 *
 * On day 1 it is also the top line of the "Using Roam on your trip" video card;
 * once the card is played or closed the line stays on its own. A one-day trip
 * is its own first day, so it gets the Day 1 line.
 *
 * All dates are calendar days ("YYYY-MM-DD") compared as strings, never as
 * local midnights (see lib/trips/countdown.ts). `todayISO` must be the reader's
 * LOCAL date worked out in the browser (lib/isSameLocalDay `localDate`).
 */

const ISO = /^\d{4}-\d{2}-\d{2}/;

/** The town: the first comma-part of the destination ("Irving, TX, USA" →
 *  "Irving"), or null when there isn't one. */
export function townOf(destination: string | null | undefined): string | null {
  const t = (destination ?? "").split(",")[0].trim();
  return t || null;
}

export function dayMoment(
  start: string | null | undefined,
  end: string | null | undefined,
  todayISO: string,
  destination: string | null | undefined,
): string | null {
  if (!start || !end || !ISO.test(start) || !ISO.test(end) || !ISO.test(todayISO)) return null;
  const s = start.slice(0, 10), e = end.slice(0, 10), t = todayISO.slice(0, 10);
  if (e < s) return null;
  const town = townOf(destination);
  const where = town ? ` in ${town}` : "";
  if (t === s) return `Day 1${where} · have a great trip`;
  if (t === e) return `Last day${where}`;
  return null;
}
