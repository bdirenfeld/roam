/**
 * Days on the ship (17 Nov 2026, Don's Iceland cruise): Plan my trip put the
 * Blue Lagoon on a day at sea. Those days are off-limits to the PLANNER only;
 * anything can still be put on them by hand.
 *
 * A ship marker is a Port card (lib/cards/port), a card that names the ship's
 * terminal, boarding or getting off, or an "At sea" note. The days from the
 * first marker to the last are on the ship. Read from the cards already there,
 * so nobody has to tell Roam about the cruise twice.
 */
import type { Card, Day } from "@/types/database";

const SHIP_WORDS = /\bcruise (terminal|port|ship)\b|\b(board|embark|disembark)(ation|ing)?\b|\b(at sea|sea day|day at sea)\b/i;

const titleOf = (c: Pick<Card, "details" | "place">): string =>
  `${c.place?.title ?? ""} ${String((c.details as { title?: unknown } | null)?.title ?? "")}`;

export const isShipMarker = (c: Pick<Card, "details" | "place">): boolean =>
  c.place?.sub_type === "port" || SHIP_WORDS.test(titleOf(c));

/** The ids of the days on the ship, from the first ship marker to the last. Empty when there is no cruise. */
export function cruiseDayIds(days: Pick<Day, "id" | "date">[], scheduled: Pick<Card, "day_id" | "details" | "place">[]): Set<string> {
  const marked = new Set(scheduled.filter((c) => c.day_id && isShipMarker(c)).map((c) => c.day_id!));
  const dates = days.filter((d) => marked.has(d.id)).map((d) => d.date).sort();
  if (!dates.length) return new Set();
  const from = dates[0], to = dates[dates.length - 1];
  return new Set(days.filter((d) => d.date >= from && d.date <= to).map((d) => d.id));
}
