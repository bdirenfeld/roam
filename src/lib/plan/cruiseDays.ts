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
import { isPortCard, nightsInPort, portDayRole } from "@/lib/cards/port";

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
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
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
    // Ashore: a port's docking day from docking (to midnight if it stays), each whole
    // day it stays, and the morning of the day it leaves (nights in port, 18 Nov 2026).
    const ashore: [number, number][] = [];
    for (const c of scheduled) {
      if (!isPortCard(c) || !c.start_time || !c.day_id) continue;
      const docked = dateOf.get(c.day_id);
      const role = docked ? portDayRole(c, docked, d.date) : null;
      if (role === "docks") ashore.push([toMin(c.start_time), nightsInPort(c) > 0 || !c.end_time ? 24 * 60 : toMin(c.end_time)]);
      else if (role === "in-port") ashore.push([0, 24 * 60]);
      else if (role === "leaves") ashore.push([0, toMin(c.end_time!)]);
    }
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

/**
 * The card a stretch of ship time starts from (18 Nov 2026, Brennan: clicking
 * "On board" / "At sea" should open the card it relates to). That is the port
 * the ship just left (its all-aboard time is where the blue begins), or the
 * boarding card on the first night. Worked out by moment, so a night in port,
 * a sea day or two in a row all land on the right port. Null when nothing on
 * the trip starts it (a cruise that begins on a port day with no boarding card).
 */
export function shipSpanSource<T extends ShipCard>(days: Pick<Day, "id" | "date">[], scheduled: T[], dayId: string, spanStart: number): T | null {
  const idx = new Map(days.map((d) => [d.id, Math.round(Date.parse(d.date + "T00:00:00Z") / 86_400_000)]));
  const at = idx.get(dayId);
  if (at === undefined) return null;
  const startMoment = at * 1440 + spanStart;
  let best: T | null = null, bestAt = -Infinity;
  const consider = (c: T, moment: number) => { if (moment <= startMoment && moment > bestAt) { best = c; bestAt = moment; } };
  for (const c of scheduled) {
    const i = c.day_id ? idx.get(c.day_id) : undefined;
    if (i === undefined) continue;
    if (isPortCard(c)) {
      // Leaves at all aboard, nights in port later; no all-aboard time reads as midnight (as shipSpans does).
      consider(c, c.end_time ? (i + nightsInPort(c)) * 1440 + toMin(c.end_time) : (i + 1) * 1440);
    } else if (isShipMarker(c) && !DISEMBARK.test(titleOf(c)) && !SEA_DAY.test(titleOf(c))) {
      consider(c, i * 1440 + (c.start_time ? toMin(c.start_time) : BOARD_FALLBACK_MIN));
    }
  }
  return best;
}
