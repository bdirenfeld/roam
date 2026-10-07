/**
 * The countdown on a journey card's caption (6 Oct 2026, Brennan — delight
 * audit): "MAR 14–17 · 3 NIGHTS · IN 5 MONTHS". One piece, uppercase like the
 * rest of the caption, or null when there is nothing worth saying.
 *
 *   more than 60 days out  → "IN N MONTHS" (whole months; "IN 1 MONTH")
 *   2–60 days out          → "IN N DAYS"
 *   1 day out              → "TOMORROW"
 *   during the journey     → "DAY N OF M" (first and last day included)
 *   up to 7 days after     → "JUST BACK"
 *   otherwise              → null
 *
 * All three dates are calendar days ("YYYY-MM-DD") and are counted as UTC
 * dates, never as local midnights: a local-midnight difference is 23 or 25
 * hours across a clock change, which is the bug that dropped the last day of
 * a new journey (91d9bc6). `todayISO` must be the reader's LOCAL date, worked
 * out in the browser (lib/isSameLocalDay `localDate`) — a server on UTC would
 * call it tomorrow from 8pm Eastern.
 */

const DAY_MS = 86_400_000;

function parts(iso: string | null | undefined): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function dayNumber(p: [number, number, number]): number {
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based; day 0 of the next month
}

/** Whole calendar months from `a` to `b` (a ≤ b). Jan 31 → Feb 28 is one
 *  month: a day past the end of a short month counts as its last day. */
function wholeMonths(a: [number, number, number], b: [number, number, number]): number {
  let months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < Math.min(a[2], daysInMonth(b[0], b[1]))) months -= 1;
  return months;
}

export function tripCountdown(start: string | null | undefined, end: string | null | undefined, todayISO: string): string | null {
  const s = parts(start), e = parts(end), t = parts(todayISO);
  if (!s || !e || !t) return null;
  const sd = dayNumber(s), ed = dayNumber(e), td = dayNumber(t);
  if (ed < sd) return null;

  if (td < sd) {
    const until = sd - td;
    if (until === 1) return "TOMORROW";
    if (until <= 60) return `IN ${until} DAYS`;
    const months = wholeMonths(t, s);
    return `IN ${months} ${months === 1 ? "MONTH" : "MONTHS"}`;
  }
  if (td <= ed) return `DAY ${td - sd + 1} OF ${ed - sd + 1}`;
  if (td - ed <= 7) return "JUST BACK";
  return null;
}
