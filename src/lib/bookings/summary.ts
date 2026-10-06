import { stayRuns, type StayCard } from "@/lib/stays/stayRuns";
import { townFromAddress } from "@/lib/stays/brief";

/**
 * The Bookings row in a journey's Settings (1 Oct 2026): one line per kind —
 * flights, hotels, a rental car — however many there are, so the row never
 * grows past three lines. Brennan: "what happens if there are multiple
 * flights ... multiple hotels?" Two flights read by date and where to; more
 * as a count and the dates. One or two hotels by name and nights; more as a
 * count and their towns in order. Tapping the row lists every booking.
 */

export interface BookingCard extends StayCard {
  day_id: string | null;
  details?: Record<string, unknown> | null;
  place?: { sub_type?: string | null; title?: string | null; address?: string | null } | null;
}
export interface BookingLine { kind: string; text: string }

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const at = (iso: string) => new Date(iso + "T12:00:00Z");
const day = (iso: string) => `${at(iso).getUTCDate()} ${MON[at(iso).getUTCMonth()]}`;
const dayWith = (iso: string) => `${DOW[at(iso).getUTCDay()]} ${day(iso)}`;
/** "22–24 Apr" in one month, "24 Aug – 4 Sep" across two. */
export function range(a: string, b: string): string {
  return a.slice(0, 7) === b.slice(0, 7) ? `${at(a).getUTCDate()}–${day(b)}` : `${day(a)} – ${day(b)}`;
}

const FLIGHT = new Set(["flight_arrival", "flight_departure"]);
const booked = (c: BookingCard) => !!c.day_id && c.status !== "interested" && c.status !== "cut";
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Where a flight goes, in a word or two: the city it lands in. */
function flightTo(c: BookingCard): string | null {
  const arriving = str(c.details?.arriving_at);
  if (arriving) return arriving.replace(/\s*\(.*\)\s*$/, "").replace(/\b(International|Airport|Intl\.?)\b/gi, "").replace(/\s+/g, " ").trim() || null;
  // An arriving flight's place is the airport it lands at.
  if (c.place?.sub_type === "flight_arrival") return townFromAddress(c.place?.address ?? null);
  return null;
}

/**
 * A rental car's pick-up card: the booking reader writes it as a transit stop
 * (Roam has no car category) titled "Pick up rental car · …" with the drop-off
 * day in details.drop_off (lib/confirmations/toCards). Also read by the To book
 * checklist (lib/booking/checklist), so the two can never disagree.
 */
export function isRentalCar(c: { details?: Record<string, unknown> | null }): boolean {
  return !!str(c.details?.drop_off) || /^pick up rental car/i.test(str(c.details?.title) ?? "");
}

export function bookingLines(days: { id: string; date: string }[], cards: BookingCard[], tripEnd: string): BookingLine[] {
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
  const mine = cards.filter(booked).filter((c) => dateOf.has(c.day_id!));
  const lines: BookingLine[] = [];

  // Flights, in date order; one card per leg (a check-in card twice is still one leg).
  const legs = mine.filter((c) => FLIGHT.has(c.place?.sub_type ?? "")).map((c) => ({ c, date: dateOf.get(c.day_id!)! }))
    // By day; the day's own order is lib/agendaOrder's, and two legs on one day keep it.
    .sort((a, b) => a.date.localeCompare(b.date));
  if (legs.length === 1 || legs.length === 2) {
    lines.push({ kind: legs.length === 1 ? "Flight" : "Flights", text: legs.map(({ c, date }) => { const to = flightTo(c); return `${dayWith(date)}${to ? ` to ${to}` : ""}`; }).join(" · ") });
  } else if (legs.length > 2) {
    lines.push({ kind: "Flights", text: `${legs.length}, ${range(legs[0].date, legs[legs.length - 1].date)}` });
  }

  // Hotels, as stays (lib/stays/stayRuns): Sandra's four nightly cards are one hotel.
  const runs = stayRuns(days.map((d) => ({ date: d.date, cards: mine.filter((c) => c.day_id === d.id) })), tripEnd);
  const addressOf = new Map(mine.filter((c) => c.place_id).map((c) => [c.place_id!, c.place?.address ?? null]));
  if (runs.length === 1 || runs.length === 2) {
    lines.push({ kind: runs.length === 1 ? "Hotel" : "Hotels", text: runs.map((r) => `${r.title}, ${range(r.checkIn, r.checkOut)}`).join(" · ") });
  } else if (runs.length > 2) {
    const towns = runs.map((r) => townFromAddress(addressOf.get(r.placeId) ?? null) ?? r.title);
    lines.push({ kind: "Hotels", text: `${runs.length}: ${towns.join(", ")}` });
  }

  // A rental car: its pick-up card carries the drop-off day (lib/confirmations/toCards).
  const cars = mine.filter(isRentalCar);
  if (cars.length) {
    const c = cars[0], from = dateOf.get(c.day_id!)!, to = str(c.details?.drop_off);
    const name = (str(c.details?.title) ?? c.place?.title ?? "Rental car").replace(/^pick up rental car\s*·\s*/i, "");
    lines.push({ kind: cars.length > 1 ? "Cars" : "Car", text: cars.length > 1 ? `${cars.length}` : `${name}${to ? `, ${range(from, to)}` : ""}` });
  }
  return lines;
}
