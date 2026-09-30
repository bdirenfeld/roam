/**
 * A day that starts or ends at an airport starts or ends there (30 Sep 2026).
 *
 * Tuscany's last day had "10:00 Pisa International Airport" saved as an
 * ordinary transit stop, not a flight, so Plan my trip put lunch in Florence
 * and the Bardini garden after it. The planner knew flights by sub-type only.
 * Now an airport is anything saved as a flight, anything Google calls an
 * airport, or anything named one, and on the journey's first and last days
 * it bounds the day:
 *
 *   last day:  plans end an hour before an airport stop, three hours before
 *              a flight's time (check-in, bags, the drive);
 *   first day: plans start an hour and a half after it (landing, bags, the
 *              drive in).
 *
 * A flight in the middle of a journey stays an ordinary fixed block.
 */

type AirportCard = {
  start_time?: string | null;
  end_time?: string | null;
  place?: { title?: string | null; sub_type?: string | null; types?: string[] | null; details?: unknown } | null;
};

const FLIGHT = new Set(["flight_arrival", "flight_departure"]);
const AIRPORT_NAME = /\b(airport|aeroporto|aéroport|aeropuerto|flughafen|luchthaven|lufthavn|aeroporto internazionale)\b/i;

export const BEFORE_FLIGHT = 180;
export const BEFORE_AIRPORT = 60;
export const AFTER_ARRIVAL = 90;

const minutes = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export function isAirport(c: AirportCard): boolean {
  const p = c.place;
  if (!p) return false;
  if (FLIGHT.has(p.sub_type ?? "")) return true;
  const types = p.types ?? (p.details as { types?: string[] } | null)?.types ?? [];
  if (types.includes("airport")) return true;
  return AIRPORT_NAME.test(p.title ?? "");
}

export interface DayBounds { from: number | null; until: number | null }

/** The earliest start and latest end for new plans on a day, from its airport cards. */
export function dayBounds(on: AirportCard[], edge: { first: boolean; last: boolean }): DayBounds {
  let from: number | null = null, until: number | null = null;
  if (edge.first === edge.last) return { from, until }; // a middle day (or a one-day journey)
  for (const c of on) {
    if (!isAirport(c)) continue;
    const s = minutes(c.start_time), e = minutes(c.end_time);
    if (s === null) continue;
    const flight = FLIGHT.has(c.place?.sub_type ?? "");
    if (edge.last) until = Math.min(until ?? Infinity, s - (flight ? BEFORE_FLIGHT : BEFORE_AIRPORT));
    // Some journeys store the landing in the start, some in the end: the later one.
    if (edge.first) from = Math.max(from ?? -Infinity, Math.max(s, e ?? s) + AFTER_ARRIVAL);
  }
  return { from, until };
}

/** How much of the day is left to plan: nothing if the airport takes the morning (or the afternoon), at most half otherwise. */
export function freeWithin(b: DayBounds, free: number): number {
  let f = free;
  if (b.until !== null) f = b.until <= 12 * 60 ? 0 : Math.min(f, 0.5);
  if (b.from !== null) f = b.from >= 15 * 60 ? 0 : Math.min(f, 0.5);
  return f;
}

/** The bounds as busy blocks, for retimeDay. */
export function boundBlocks(b: DayBounds): { start: number; end: number }[] {
  return [
    ...(b.from !== null ? [{ start: 0, end: b.from }] : []),
    ...(b.until !== null ? [{ start: Math.max(0, b.until), end: 24 * 60 }] : []),
  ];
}
