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
