/**
 * What Find's place view says about opening hours (29 Sep 2026): not the
 * week's timetable, but the one thing that changes a decision, which of
 * the journey's own days the place is shut. Google's weekday_text is one
 * line a weekday ("Monday: Closed", "Tuesday: 9:00 AM – 6:00 PM").
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The journey's dates (YYYY-MM-DD) the place is closed, as "Mon 27 Apr". Empty when hours are unknown. */
export function closedOnTrip(weekdayText: string[] | null | undefined, dates: string[]): string[] {
  if (!weekdayText || weekdayText.length === 0) return [];
  const closed = new Set<number>();
  for (const line of weekdayText) {
    const i = DAYS.findIndex((d) => line.startsWith(d + ":"));
    if (i >= 0 && /closed/i.test(line.slice(DAYS[i].length + 1))) closed.add(i);
  }
  return dates
    .map((d) => new Date(d + "T12:00:00Z"))
    .filter((d) => closed.has(d.getUTCDay()))
    .map((d) => `${SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`);
}

/** "$$" from Google's 0-4 price level, or null. */
export function priceSigns(level: number | null | undefined): string | null {
  if (level == null || level < 1) return null;
  return "$".repeat(Math.min(4, level));
}

/**
 * What a place is, in a line (1 Oct 2026, Brennan: "you just end up seeing
 * pictures which don't tell you much re what's the gist of it"). The
 * travellers' reason when there is one; a Google result's "why" is only its
 * rating, which the facts line already shows, so Google's own short summary
 * of the place stands in. Neither: nothing.
 */
export function placeBlurb(why: string | null | undefined, editorial: string | null | undefined): string | null {
  const own = why?.trim();
  if (own && !/^(Rated [\d.]+ on Google|Well rated on Google)/.test(own)) return own;
  return editorial?.trim() || null;
}
