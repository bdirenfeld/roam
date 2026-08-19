import type { Trip } from "@/types/database";

/**
 * A journey belongs in "Past journeys" once its end_date is more than 7 days
 * before today. Everything else — including trips still ahead of us, in progress,
 * or only recently ended — stays in the active list.
 *
 * This is read-time derivation only: it ignores `trips.status` (which is set
 * manually and drifts out of date) and never writes to the DB.
 *
 * Comparison is date-only. The 7-day buffer makes timezone drift irrelevant,
 * so a plain server-side date is used deliberately — no timezone logic.
 *
 * A trip with no end_date is treated as active.
 */
export function isPastJourney(trip: Pick<Trip, "end_date">): boolean {
  if (!trip.end_date) return false;

  const end = new Date(trip.end_date + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEnd = Math.floor((today.getTime() - end.getTime()) / msPerDay);

  return daysSinceEnd > 7;
}

/**
 * The single definition of "belongs in Past journeys", shared by the /trips
 * upcoming/past split and the /past-journeys page: explicitly archived, or
 * past by the recency rule above. Keep both pages on this predicate so the
 * two lists never drift apart.
 */
export function belongsInPastJourneys(
  trip: Pick<Trip, "archived" | "end_date">,
): boolean {
  return trip.archived === true || isPastJourney(trip);
}
