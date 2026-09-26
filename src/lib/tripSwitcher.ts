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

export function groupTrips<T extends SwitcherTrip>(trips: T[], today: string): { upcoming: T[]; past: T[] } {
  const live = trips.filter((t) => !t.archived);
  const upcoming = live.filter((t) => t.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = live.filter((t) => t.end_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date));
  return { upcoming, past };
}
