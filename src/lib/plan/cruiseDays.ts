/**
 * Days on the ship (17 Nov 2026, Don's Iceland cruise): Plan my trip put the
 * Blue Lagoon on a day at sea. Those days are off-limits to the PLANNER only;
 * anything can still be put on them by hand.
 *
 * A ship marker is a Port card (lib/cards/port), a card that names the ship's
 * terminal, boarding or getting off, or an "At sea" note. The days from the
 * first marker to the last are on the ship. Read from the cards already there,
 * so nobody has to tell Roam about the cruise twice. A day NAMED "Day at sea"
 * counts too: naming a day is the door people already know.
 *
 * The week paints ship time pale blue (shipSpans, 17 Nov 2026, Brennan: "you're
 * on the water"). Grey stays the background and means nothing.
 */
import type { Card, Day } from "@/types/database";
import { isPortCard, isOvernight } from "@/lib/cards/port";

const SHIP_WORDS = /\bcruise (terminal|port|ship)\b|\b(board|embark|disembark)(ation|ing)?\b|\b(at sea|sea day|day at sea)\b/i;

/** Days by date, and minute spans by their start: neither orders cards (that is lib/agendaOrder). */
const byDate = <T extends { date: string }>(xs: T[]): T[] => xs.slice().sort((a, b) => a.date.localeCompare(b.date));
const bySpanStart = (xs: [number, number][]): [number, number][] => xs.slice().sort((a, b) => a[0] - b[0]);

const SEA_DAY = /\b(at sea|sea day|day at sea|cruising)\b/i;
const DISEMBARK = /\bdisembark/i;

const titleOf = (c: Pick<Card, "details" | "place">): string =>
  `${c.place?.title ?? ""} ${String((c.details as { title?: unknown } | null)?.title ?? "")}`;

export const isShipMarker = (c: Pick<Card, "details" | "place">): boolean =>
  c.place?.sub_type === "port" || SHIP_WORDS.test(titleOf(c));

/** The ids of the days on the ship, from the first ship marker to the last. Empty when there is no cruise. */
export function cruiseDayIds(days: (Pick<Day, "id" | "date"> & { theme?: string | null })[], scheduled: Pick<Card, "day_id" | "details" | "place">[]): Set<string> {
  const marked = new Set(scheduled.filter((c) => c.day_id && isShipMarker(c)).map((c) => c.day_id!));
  for (const d of days) if (d.theme && SEA_DAY.test(d.theme)) marked.add(d.id);
  const dates = byDate(days.filter((d) => marked.has(d.id))).map((d) => d.date);
  if (!dates.length) return new Set();
  const from = dates[0], to = dates[dates.length - 1];
  return new Set(days.filter((d) => d.date >= from && d.date <= to).map((d) => d.id));
}

type ShipCard = Pick<Card, "day_id" | "details" | "place" | "start_time" | "end_time">;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** When boarding starts if the boarding card has no time: the evening. */
export const BOARD_FALLBACK_MIN = 17 * 60;

/**
 * Minutes of each cruise day spent on the ship, as [from, to) spans over the
 * whole day (0–1440). A sea day is all of it. A port day is the day less the
 * hours ashore (docks → all aboard; a night in port runs ashore to midnight and
 * carries into the next morning). Boarding day starts at the boarding card's
 * time; a "disembark" card ends the last day at its time.
 */
export function shipSpans(days: (Pick<Day, "id" | "date"> & { theme?: string | null })[], scheduled: ShipCard[]): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  const on = cruiseDayIds(days, scheduled);
  if (!on.size) return out;
  const ordered = byDate(days.filter((d) => on.has(d.id)));
  ordered.forEach((d, i) => {
    const cards = scheduled.filter((c) => c.day_id === d.id);
    let from = 0, to = 24 * 60;
    if (i === 0) {
      // Boarding day: from the boarding card's time (the evening if it has none). A first
      // day that is a port or a sea day has no boarding card and starts on board.
      const board = cards.find((c) => isShipMarker(c) && !isPortCard(c) && !DISEMBARK.test(titleOf(c)) && !SEA_DAY.test(titleOf(c)));
      if (board) from = board.start_time ? toMin(board.start_time) : BOARD_FALLBACK_MIN;
    }
    const off = cards.find((c) => DISEMBARK.test(titleOf(c)) && c.start_time);
    if (off) to = toMin(off.start_time!);
    // Ashore: today's ports, and last night's port if the ship stayed.
    const prev = i > 0 ? ordered[i - 1] : null;
    const ashore: [number, number][] = [];
    for (const c of cards) if (isPortCard(c) && c.start_time) ashore.push([toMin(c.start_time), isOvernight(c) || !c.end_time ? 24 * 60 : toMin(c.end_time)]);
    if (prev) for (const c of scheduled) if (c.day_id === prev.id && isPortCard(c) && isOvernight(c)) ashore.push([0, toMin(c.end_time!)]);
    const spans: [number, number][] = [];
    let at = from;
    for (const [a, z] of bySpanStart(ashore)) {
      if (a > at) spans.push([at, Math.min(a, to)]);
      at = Math.max(at, z);
    }
    if (at < to) spans.push([at, to]);
    out.set(d.id, spans.filter(([a, z]) => z > a));
  });
  return out;
}
