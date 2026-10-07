/**
 * The card sheet's one-line opening hours, under the address and time
 * (7 Oct 2026, taps audit): "Open 8:15 AM – 6:30 PM today", "Closed today".
 * `value` is the part of Google's weekday line after "Tuesday: ". When the
 * card's day is not today the line names the day instead ("on Tuesday"), so it
 * never says "today" about a day you are not on.
 *
 * Hours that run past midnight say so: Google writes Sesriem Canyon as
 * "6:30 AM – 6:00 AM", which read as a typo until "next day" was added, and a
 * 12:00 AM close is "midnight" (found testing live, 7 Oct 2026).
 */
function minutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

function readable(range: string): string {
  const parts = range.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return range;
  const [open, close] = parts;
  const a = minutes(open), b = minutes(close);
  if (a == null || b == null) return range;
  if (b === 0) return `${open} – midnight`;
  return b <= a ? `${open} – ${close} (next day)` : range;
}

export function hoursSummary(value: string, weekday: string, isToday: boolean): string {
  const when = isToday ? "today" : `on ${weekday}`;
  const v = value.trim();
  if (/^closed$/i.test(v)) return `Closed ${when}`;
  if (/^open\b/i.test(v)) return `${v.charAt(0).toUpperCase()}${v.slice(1)} ${when}`;
  return `Open ${v.split(/,\s*/).map(readable).join(", ")} ${when}`;
}

/** Is `date` ("YYYY-MM-DD") the local calendar date of `now`? */
export function isLocalToday(date: string, now: Date = new Date()): boolean {
  const pad = (n: number) => String(n).padStart(2, "0");
  return date === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
