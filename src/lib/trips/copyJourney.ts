/**
 * Copy to new dates (7 Oct 2026, mock t07 approved). Brennan wanted New York
 * again with Bodhi: the only way was an empty journey and 4 days and 105
 * cards rebuilt by hand. This is the one rule for what a copy carries:
 *
 *   - a new journey owned by the person copying, with the new title, dates and
 *     party; destination, cover, cruise flag and the rest carried over;
 *     never the share link, never the people it was shared with, and the
 *     Bookings ticks start empty;
 *   - the same number of days, laid on the new dates (lib/tripDates, UTC, so a
 *     clock change cannot lose a day), each keeping its typed name;
 *   - every planned card on the same day number, same place, times, position
 *     and notes, but NOT booked: confirmation numbers, flight numbers, seats
 *     and prices stay behind, and flights / stays / cars / anything that was
 *     booked come back marked `to_book` (a placeholder to book again);
 *   - saved places only when asked; cut and archived cards never;
 *   - places are reused (place_id), never duplicated. Files never travel.
 *
 * Pure: rows in, rows out. The route (api/trips/copy) does the writes.
 */

import { tripDates } from "@/lib/tripDates";
import { isRentalCar } from "@/lib/bookings/summary";

export interface CopyTripRow {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  start_date: string;
  end_date: string;
  trip_purpose?: string | null;
  trip_type?: string | null;
  cruise?: boolean | null;
  party_size?: number | null;
  party_ages?: number[] | null;
  accommodation_name?: string | null;
  accommodation_address?: string | null;
  stay_nights?: Record<string, number> | null;
  cover_image_url?: string | null;
  notes?: string | null;
}

export interface CopyDayRow {
  id: string;
  date: string;
  day_number?: number | null;
  day_name?: string | null;
  theme?: string | null;
  narrative_position?: string | null;
}

export interface CopyCardRow {
  id: string;
  day_id: string | null;
  status: string;
  archived?: boolean | null;
  place_id: string | null;
  start_time: string | null;
  end_time: string | null;
  position: number;
  details: Record<string, unknown> | null;
  confirmed?: boolean | null;
  source_url?: string | null;
  ai_generated?: boolean | null;
  place?: { sub_type?: string | null } | null;
}

export interface CopyChoices {
  userId: string;
  title: string;
  startDate: string;
  partySize: number;
  partyAges: number[] | null;
  includeSaved: boolean;
  /** Ids for the new rows; crypto.randomUUID in the app, a counter in tests. */
  newId: () => string;
}

export interface CopyResult {
  trip: Record<string, unknown>;
  days: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  /** For the toast: "Copied · 4 days, 19 places". */
  counts: { days: number; places: number };
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const utc = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const shiftDate = (iso: string, days: number) => new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/** How many days the journey runs, first and last included. */
export function journeyLength(start: string, end: string): number {
  return Math.max(1, daysBetween(start, end) + 1);
}

/** The new last day: same length as the journey being copied. */
export function endFor(start: string, length: number): string {
  return shiftDate(start, Math.max(1, length) - 1);
}

/** An automatic "Day 3" name is not a name anyone typed; it is not carried. */
const typed = (v: string | null | undefined) => (v && v.trim() && !/^day\s*\d+$/i.test(v.trim()) ? v : null);

/** A saved place on the map: kept, not cut or archived, and a real place (not a list note). */
export function isSavedPlace(c: Pick<CopyCardRow, "status" | "archived" | "place_id">): boolean {
  return (c.status === "interested" || c.status === "on_map") && c.archived !== true && !!c.place_id;
}

/** A card still to book: came from a copy, and nobody has booked it since (upload or the ⋯ Booked switch). */
export function isToBook(c: { details?: Record<string, unknown> | null; confirmed?: boolean | null }): boolean {
  return c.details?.to_book === true && c.confirmed !== true;
}

/** Keys that belong to one booking and must not ride into a new journey. */
const BOOKING_ONLY = ["confirmation", "flight_number", "seat", "paid_total", "paid_currency"];
/** Dates inside details that move with the journey (a hotel's check-out, a car's drop-off). */
const DATED = ["check_out", "check_out_date", "end_date", "drop_off"];
const BOOKABLE = new Set(["flight_arrival", "flight_departure", "hotel"]);

/** A card's details for the copy: booking-only fields gone, dates moved by `offset` days. */
export function copyDetails(details: Record<string, unknown> | null | undefined, offset: number): Record<string, unknown> {
  const d: Record<string, unknown> = { ...(details ?? {}) };
  for (const k of BOOKING_ONLY) delete d[k];
  // A price the app found online last time is last year's price.
  const src = d.cost_source as { kind?: string } | undefined;
  if (src && src.kind === "found") { delete d.cost_source; delete d.cost_per_person; delete d.budget; }
  for (const k of DATED) {
    const v = d[k];
    if (typeof v === "string" && ISO.test(v.trim())) d[k] = shiftDate(v.trim(), offset);
  }
  delete d.to_book;
  return d;
}

/** Was this a booking last time (a flight, a stay, a car, or anything marked booked)? */
function wasBooking(c: CopyCardRow): boolean {
  return c.confirmed === true || BOOKABLE.has(c.place?.sub_type ?? "") || isRentalCar(c);
}

export function copyJourney(src: { trip: CopyTripRow; days: CopyDayRow[]; cards: CopyCardRow[] }, choose: CopyChoices): CopyResult {
  const { trip } = src;
  const length = journeyLength(trip.start_date, trip.end_date);
  const start = choose.startDate;
  const end = endFor(start, length);
  const offset = daysBetween(trip.start_date, start);
  const tripId = choose.newId();

  const newTrip: Record<string, unknown> = {
    id: tripId,
    user_id: choose.userId,
    title: choose.title.trim() || trip.title,
    destination: trip.destination,
    destination_lat: trip.destination_lat,
    destination_lng: trip.destination_lng,
    start_date: start,
    end_date: end,
    trip_purpose: trip.trip_purpose ?? null,
    trip_type: trip.trip_type ?? null,
    cruise: trip.cruise === true,
    party_size: choose.partySize,
    party_ages: choose.partyAges,
    accommodation_name: trip.accommodation_name ?? null,
    accommodation_address: trip.accommodation_address ?? null,
    stay_nights: trip.stay_nights ?? null,
    cover_image_url: trip.cover_image_url ?? null,
    notes: trip.notes ?? null,
    booking_checklist: {},
    status: "planning",
    archived: false,
  };

  // Each old day by its place in the journey: day N of the old journey is day N
  // of the new one. A day dated outside the old range sits on the nearest end.
  const dates = tripDates(start, end);
  const newDays = dates.map((date, i) => ({ id: choose.newId(), trip_id: tripId, date, day_number: i + 1 } as Record<string, unknown>));
  const indexOf = new Map<string, number>();
  for (const d of src.days) {
    const i = Math.min(dates.length - 1, Math.max(0, daysBetween(trip.start_date, d.date)));
    indexOf.set(d.id, i);
    const nd = newDays[i];
    // First typed name wins when two old days land on one new day.
    if (nd.theme == null && typed(d.theme)) nd.theme = d.theme;
    if (nd.day_name == null && typed(d.day_name)) nd.day_name = d.day_name;
    if (nd.narrative_position == null && d.narrative_position) nd.narrative_position = d.narrative_position;
  }

  const cards: Record<string, unknown>[] = [];
  const planned = new Set<string>();
  for (const c of src.cards) {
    if (c.archived === true || c.status === "cut") continue;
    const dayIdx = c.day_id ? indexOf.get(c.day_id) : undefined;
    const isPlanned = c.status === "in_itinerary" && dayIdx !== undefined;
    const isSaved = !isPlanned && isSavedPlace(c);
    if (!isPlanned && !(isSaved && choose.includeSaved)) continue;
    const details = copyDetails(c.details, offset);
    if (isPlanned && wasBooking(c)) details.to_book = true;
    if (isPlanned && c.place_id) planned.add(c.place_id);
    cards.push({
      id: choose.newId(),
      trip_id: tripId,
      day_id: dayIdx !== undefined ? newDays[dayIdx].id : null,
      list_id: null,
      status: isPlanned ? "in_itinerary" : c.status,
      place_id: c.place_id,
      start_time: c.start_time,
      end_time: c.end_time,
      position: c.position,
      details,
      confirmed: false,
      source_url: c.source_url ?? null,
      ai_generated: c.ai_generated === true,
    });
  }

  return { trip: newTrip, days: newDays, cards, counts: { days: newDays.length, places: planned.size } };
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = (iso: string) => new Date(utc(iso));
/** "Thu 22 Jul 2027" — read off the date string, so no timezone moves it. */
export function longDay(iso: string, withYear = true): string {
  const d = at(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** "4 days · Thu 22 Jul – Sun 25 Jul 2027". */
export function copyCaption(start: string, length: number): string {
  const end = endFor(start, length);
  const n = Math.max(1, length);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${n} ${n === 1 ? "day" : "days"} · ${longDay(start, !sameYear)} – ${longDay(end)}`;
}

/** "Thursday" — the weekday the old journey started on. */
export function weekdayOf(iso: string): string {
  return DOW_LONG[at(iso).getUTCDay()];
}

/**
 * The start the sheet opens on: the same weekday a year on (52 weeks, so a
 * Thursday stays a Thursday), and further on in whole years until it is not
 * in the past.
 */
export function suggestStart(oldStart: string, today: string): string {
  let s = shiftDate(oldStart, 364);
  while (s < today) s = shiftDate(s, 364);
  return s;
}

/** "Copied · 4 days, 19 places". */
export function copiedMessage(counts: { days: number; places: number }): string {
  const days = `${counts.days} ${counts.days === 1 ? "day" : "days"}`;
  return counts.places ? `Copied · ${days}, ${counts.places} ${counts.places === 1 ? "place" : "places"}` : `Copied · ${days}`;
}

/**
 * The party's ages on the new dates: a year older per year on, counted to the
 * nearest year — a copy 52 weeks later (same weekday) is a year on, though
 * lib/party ageForward, which counts whole years, would call it none.
 */
export function agesOn(ages: number[] | null, fromDate: string, toDate: string): number[] | null {
  if (!ages) return ages;
  const years = Math.round(daysBetween(fromDate, toDate) / 365.25);
  return years > 0 ? ages.map((a) => a + years) : ages;
}
