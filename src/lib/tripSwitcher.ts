/**
 * The masthead's trip switcher (26 Sep 2026): "Tuscany ▾" lists the other
 * journeys so switching does not mean going back to Journeys first.
 *
 * Upcoming (including one under way) soonest first, then past, most recent
 * first. Archived journeys stay on the Journeys page's Archived shelf.
 */

export interface SwitcherTrip {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  archived?: boolean | null;
}

/** Most journeys the menu lists (5 Oct 2026); the rest are one tap away on Journeys. */
export const SWITCHER_CAP = 8;

export function groupTrips<T extends SwitcherTrip>(trips: T[], today: string, cap = SWITCHER_CAP): { upcoming: T[]; past: T[]; hidden: number } {
  const live = trips.filter((t) => !t.archived);
  const allUpcoming = live.filter((t) => t.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const allPast = live.filter((t) => t.end_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = allUpcoming.slice(0, cap);
  const past = allPast.slice(0, Math.max(0, cap - upcoming.length));
  return { upcoming, past, hidden: live.length - upcoming.length - past.length };
}
