/**
 * Is this "YYYY-MM-DD" the same calendar day as `now`, in the reader's own
 * timezone?
 *
 * Used by the shared page to mark today and scroll to it. It has to be the
 * READER's timezone, and it has to be computed where the reader is: a Vercel
 * server runs on UTC and would call it tomorrow from 8pm Eastern onwards, so a
 * family in Toronto checking the plan after dinner would be shown the wrong day.
 *
 * This is the second place that lesson has come up — `resolveDefaultDay` builds
 * its date string by hand for the same reason, rather than using toISOString(),
 * which converts to UTC and lands on the wrong calendar day near midnight.
 */
export function localDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isSameLocalDay(date: string, now: Date = new Date()): boolean {
  return localDate(now) === date;
}

/** Is this "YYYY-MM-DD" still ahead of `now`, in the reader's own timezone?
 *  ISO dates compare correctly as strings. */
export function isBeforeLocalDay(date: string, now: Date = new Date()): boolean {
  return localDate(now) < date;
}

/**
 * Is the journey under way on `now`, in the reader's own timezone? True when
 * today's local date is between start and end, both days included (2 Oct 2026,
 * video 4's "Your trip's started" card on the phone's day). Date-only: the
 * last day counts until local midnight. A missing date, or an end before the
 * start, is never under way.
 */
export function isUnderwayLocal(start: string | null | undefined, end: string | null | undefined, now: Date = new Date()): boolean {
  if (!start || !end) return false;
  const s = start.slice(0, 10), e = end.slice(0, 10);
  if (e < s) return false;
  const today = localDate(now);
  return s <= today && today <= e;
}
