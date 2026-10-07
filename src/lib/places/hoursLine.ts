/**
 * The card sheet's one-line opening hours, under the address and time
 * (7 Oct 2026, taps audit): "Open 8:15 AM – 6:30 PM today", "Closed today".
 * `value` is the part of Google's weekday line after "Tuesday: ". When the
 * card's day is not today the line names the day instead ("on Tuesday"), so it
 * never says "today" about a day you are not on.
 */
export function hoursSummary(value: string, weekday: string, isToday: boolean): string {
  const when = isToday ? "today" : `on ${weekday}`;
  const v = value.trim();
  if (/^closed$/i.test(v)) return `Closed ${when}`;
  if (/^open\b/i.test(v)) return `${v.charAt(0).toUpperCase()}${v.slice(1)} ${when}`;
  return `Open ${v} ${when}`;
}

/** Is `date` ("YYYY-MM-DD") the local calendar date of `now`? */
export function isLocalToday(date: string, now: Date = new Date()): boolean {
  const pad = (n: number) => String(n).padStart(2, "0");
  return date === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
