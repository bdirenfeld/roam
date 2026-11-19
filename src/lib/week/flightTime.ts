/**
 * Time in the air, shaded on the week (18 Nov 2026, Brennan, mock approved:
 * "similar to what we did for the ports on cruises"). A pale grey band from
 * takeoff to landing, across midnight, labelled "In the air · to Pisa"; the
 * label opens the flight's card.
 *
 * Flights are stored two ways (every journey checked, 18 Nov 2026):
 *  - one card, start = takeoff, end = landing (Rome AC890 19:45 → 10:20 the
 *    next morning; an end before the start is the next day), and
 *  - a takeoff card with no end, then a landing card for the airport it names
 *    (Tuscany's placeholders: YYZ 7 pm, then Pisa 11:30 the next day).
 * Only a card that names both airports counts (details.origin_airport and
 * details.arriving_at), so "Land in Sydney 7:00–9:30", time AT the airport,
 * gets nothing. Each city's own clock is used, as the cards are entered.
 */

import { airportCode } from "@/lib/flights/airportZones";
import { storedOnLandingDay } from "@/lib/cardTime";

type Day = { id: string; date: string };
export type FlightCard = {
  id: string; day_id: string | null; status?: string | null; start_time: string | null; end_time: string | null;
  details?: unknown; place?: { title?: string | null; sub_type?: string | null } | null;
};
/** One flight on the journey clock: the card its label opens, where it lands, the two airports as
 *  keys (code, else the name) so a connection can be matched, and a two-card flight's landing card. */
export interface FlightSpan<C> { start: number; end: number; card: C; to: string; fromKey?: string; toKey?: string; landing?: C }

const DAY_MS = 86_400_000;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const airports = (c: FlightCard) => {
  const d = (c.details ?? {}) as { origin_airport?: unknown; arriving_at?: unknown };
  return typeof d.origin_airport === "string" && typeof d.arriving_at === "string" && d.origin_airport.trim() && d.arriving_at.trim()
    ? { from: d.origin_airport.trim(), to: d.arriving_at.trim() } : null;
};
/** "PSA", "Roma Fiumicino Airport (FCO)", "Frankfurt FRA" → the code, or null. */
const codeOf = (s: string) => airportCode(s);
/** An airport as a key a connection matches on: its code, else its name. */
export const airportKey = (s: string) => codeOf(s) ?? s.trim().toLowerCase();

/** Where a flight is going, said plainly: "Pisa", "Roma Fiumicino", "Toronto Pearson", or the code. */
export function placeName(s: string): string {
  // "Frankfurt FRA" (the hand form's way) loses its code too (19 Nov 2026); "PSA" alone stays "PSA".
  const t = s.replace(/\([A-Z]{3}\)/g, "").replace(/(\S)\s+[A-Z]{3}$/, "$1").replace(/\b(international|int)\b\.?/gi, "").replace(/\bairport\b/gi, "").replace(/\s+/g, " ").replace(/[\s,–-]+$/, "").trim();
  return t || s.trim();
}

/** Minutes from the first day of the journey: a card's moment on one clock. */
function momentOf(dayNum: Map<string, number>, c: FlightCard, time: string): number | null {
  const n = c.day_id ? dayNum.get(c.day_id) : undefined;
  return n === undefined ? null : n * 1440 + toMin(time);
}

/** Every flight's time in the air, as moments, with the card the label opens and where it lands. */
export function flightsInAir<C extends FlightCard>(days: Day[], cards: C[]): FlightSpan<C>[] {
  const first = Math.min(...days.map((d) => Date.parse(d.date + "T00:00:00Z")));
  const dayNum = new Map(days.map((d) => [d.id, Math.round((Date.parse(d.date + "T00:00:00Z") - first) / DAY_MS)]));
  const live = cards.filter((c) => c.status !== "cut" && c.start_time && airports(c));
  const out: FlightSpan<C>[] = [];
  const landingCards = new Set<string>();
  // A card's moment on the journey clock. One helper, so no sort below reads a raw start_time
  // (houseRules: a day's ORDER comes from agendaOrder; these are flight spans, not a day's order).
  const at = (x: C) => momentOf(dayNum, x, x.start_time!);
  // The two-card flight: a takeoff with no end, landed by the next card at the airport it names (within two days).
  for (const c of live) {
    if (c.end_time) continue;
    const a = airports(c)!, start = at(c);
    if (start === null) continue;
    const want = codeOf(a.to) ?? a.to.toLowerCase();
    const landing = live
      .filter((x) => x.id !== c.id)
      .map((x) => ({ x, when: at(x) }))
      .filter(({ x, when }) => when !== null && when > start && when - start <= 2 * 1440 && (codeOf(airports(x)!.to) ?? airports(x)!.to.toLowerCase()) === want)
      .sort((p, q) => p.when! - q.when!)[0];
    if (!landing) continue;
    landingCards.add(landing.x.id);
    out.push({ start, end: landing.when!, card: c, to: placeName(landing.x.place?.title || a.to), fromKey: airportKey(a.from), toKey: airportKey(a.to), landing: landing.x });
  }
  // The one-card flight: start to end; an end before the start lands the next day.
  for (const c of live) {
    if (!c.end_time || landingCards.has(c.id)) continue;
    const start = at(c);
    if (start === null) continue;
    let end = start - (start % 1440) + toMin(c.end_time);
    if (end <= start) end += 1440;
    // Kept on the day it lands (Rome AC890, lib/cardTime): it took off the evening before.
    const onLanding = storedOnLandingDay({ start_time: c.start_time, end_time: c.end_time, details: c.details ?? null, place: c.place ? { sub_type: c.place.sub_type ?? null } : null });
    const a = airports(c)!;
    if (onLanding) {
      out.push({ start: start - 1440, end: end - 1440, card: c, to: placeName(a.to), fromKey: airportKey(a.from), toKey: airportKey(a.to) });
      continue;
    }
    out.push({ start, end, card: c, to: placeName(a.to), fromKey: airportKey(a.from), toKey: airportKey(a.to) });
  }
  // A flight entered twice (a departure and an arrival card with the same times) shades once.
  const seen = new Set<string>();
  return out.filter((f) => { const k = `${f.start}-${f.end}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((p, q) => p.start - q.start);
}

/** Longest gap between two flights that is still a layover (TripIt's rule: longer is a stopover). */
export const LAYOVER_MAX = 24 * 60;

/** A layover: landed at `at`, next takeoff from there, `start`→`end` on the journey clock. */
export interface Layover<C> { start: number; end: number; at: string; arrived: C; leaves: C }
/** Flights joined by layovers (19 Nov 2026): first takeoff → last landing, where it ends, via where. */
export interface FlightTrip<C> { start: number; end: number; legs: FlightSpan<C>[]; layovers: Layover<C>[]; to: string; via: string[] }

/**
 * Connections, worked out, never typed (19 Nov 2026, Brennan approved the
 * mock; TripIt and Google Flights do it this way): the next flight leaves from
 * the airport the last one landed at, within 24 hours. Both times are on that
 * airport's own clock, so the layover's length is exact.
 */
export function flightTrips<C extends FlightCard>(days: Day[], cards: C[]): FlightTrip<C>[] {
  const spans = flightsInAir(days, cards);
  const used = new Set<FlightSpan<C>>();
  const trips: FlightTrip<C>[] = [];
  for (const s of spans) {
    if (used.has(s)) continue;
    used.add(s);
    const legs = [s];
    const layovers: Layover<C>[] = [];
    for (;;) {
      const last = legs[legs.length - 1];
      const next = spans.find((x) => !used.has(x) && x.fromKey && x.fromKey === last.toKey && x.start >= last.end && x.start - last.end <= LAYOVER_MAX);
      if (!next) break;
      used.add(next);
      layovers.push({ start: last.end, end: next.start, at: last.to, arrived: last.landing ?? last.card, leaves: next.card });
      legs.push(next);
    }
    const end = legs[legs.length - 1];
    trips.push({ start: s.start, end: end.end, legs, layovers, to: end.to, via: layovers.map((l) => l.at) });
  }
  return trips;
}

/** A day's slice of a stretch of the journey clock, clipped to the grid's hours. */
export function slices(days: Day[], start: number, end: number, hourStart: number, hourEnd: number): { id: string; from: number; to: number; first: boolean }[] {
  const firstDay = Math.min(...days.map((d) => Date.parse(d.date + "T00:00:00Z")));
  const byNum = new Map(days.map((d) => [Math.round((Date.parse(d.date + "T00:00:00Z") - firstDay) / DAY_MS), d.id]));
  const out: { id: string; from: number; to: number; first: boolean }[] = [];
  for (let n = Math.floor(start / 1440); n <= Math.floor((end - 1) / 1440); n++) {
    const id = byNum.get(n);
    if (!id) continue;
    const s = Math.max(start, n * 1440) - n * 1440, e = Math.min(end, (n + 1) * 1440) - n * 1440;
    const s2 = Math.max(s, hourStart * 60), e2 = Math.min(e, (hourEnd + 1) * 60);
    if (e2 > s2) out.push({ id, from: s2, to: e2, first: n * 1440 + s === start });
  }
  return out;
}

/**
 * The bands for each day, clipped to the grid's hours: [from, to) minutes of
 * that day, whether it is long enough to carry a label (2 h, as the ship's),
 * whether the band starts that day at takeoff, the card, where it lands and,
 * for connecting flights, where it changes: one band from the first takeoff
 * to the last landing, so a layover never looks like free time.
 */
export function flightBands<C extends FlightCard>(days: Day[], cards: C[], hourStart: number, hourEnd: number): Map<string, { from: number; to: number; label: boolean; takeoff: boolean; card: C; dest: string; via?: string }[]> {
  const out = new Map<string, { from: number; to: number; label: boolean; takeoff: boolean; card: C; dest: string; via?: string }[]>();
  if (!days.length) return out;
  for (const t of flightTrips(days, cards)) {
    for (const sl of slices(days, t.start, t.end, hourStart, hourEnd)) {
      const list = out.get(sl.id) ?? [];
      list.push({ from: sl.from, to: sl.to, label: sl.to - sl.from >= 120, takeoff: sl.first, card: t.legs[0].card, dest: t.to, ...(t.via.length ? { via: t.via.join(", ") } : {}) });
      out.set(sl.id, list);
    }
  }
  return out;
}

/** Each day's layovers, hatched over the band: where, how long, and whether there's room for words (30 min). */
export function layoverBands<C extends FlightCard>(days: Day[], cards: C[], hourStart: number, hourEnd: number): Map<string, { from: number; to: number; at: string; minutes: number; label: boolean; card: C }[]> {
  const out = new Map<string, { from: number; to: number; at: string; minutes: number; label: boolean; card: C }[]>();
  if (!days.length) return out;
  for (const t of flightTrips(days, cards)) {
    for (const l of t.layovers) {
      for (const sl of slices(days, l.start, l.end, hourStart, hourEnd)) {
        const list = out.get(sl.id) ?? [];
        list.push({ from: sl.from, to: sl.to, at: l.at, minutes: l.end - l.start, label: sl.to - sl.from >= 30, card: l.leaves });
        out.set(sl.id, list);
      }
    }
  }
  return out;
}

/** The flights either side of a card, for its layover row: the one it connects from and the one it connects to. */
export function connectionsOf<C extends FlightCard>(days: Day[], cards: C[], cardId: string): { before: Layover<C> | null; after: Layover<C> | null } {
  for (const t of flightTrips(days, cards)) {
    const i = t.legs.findIndex((l) => l.card.id === cardId || l.landing?.id === cardId);
    if (i >= 0) return { before: i > 0 ? t.layovers[i - 1] : null, after: i < t.layovers.length ? t.layovers[i] : null };
  }
  return { before: null, after: null };
}
