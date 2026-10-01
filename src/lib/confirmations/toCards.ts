/**
 * A parsed booking confirmation, turned into what a hand-made card holds
 * (1 Oct 2026). Brennan: an uploaded flight or hotel "should populate this
 * information in the app". The reader used to fill only a title and a notes
 * blob: AC890 sat in the notes, a hotel had no check-out, and nothing was a
 * real place, so no pin, no photo and no stay.
 */

export type ConfirmationType = "flight_arrival" | "flight_departure" | "hotel" | "car_rental" | "restaurant" | "activity";

export interface ParsedConfirmation {
  type: ConfirmationType;
  title: string;
  confirmation_number: string | null;
  date: string | null;
  time: string | null;
  end_time: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  /** Flights: what the flight sheet shows (FlightArrivalDetail). */
  airline?: string | null;
  flight_number?: string | null;
  origin_airport?: string | null;
  arriving_at?: string | null;
  seat?: string | null;
  /** Hotels: the day and time you leave. */
  check_out_date?: string | null;
  check_out_time?: string | null;
  /** Rental cars: when and where it goes back. */
  drop_off_date?: string | null;
  drop_off_time?: string | null;
  drop_off_location?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const isFlight = (t: ConfirmationType) => t === "flight_arrival" || t === "flight_departure";

/** The card's details: the fields its sheet already shows, each in its own place. */
export function confirmationDetails(p: ParsedConfirmation, edits: { title: string; notes: string; confirmation: string }): Record<string, unknown> {
  const d: Record<string, unknown> = { title: edits.title.trim() };
  const set = (k: string, v: unknown) => { const c = clean(v); if (c) d[k] = c; };
  set("confirmation", edits.confirmation);
  set("phone", p.phone);
  set("website", p.website);
  set("notes", edits.notes);
  if (isFlight(p.type)) {
    set("airline", p.airline);
    set("flight_number", p.flight_number?.replace(/\s+/g, ""));
    set("origin_airport", p.origin_airport);
    set("arriving_at", p.arriving_at);
    set("seat", p.seat);
  }
  if (p.type === "hotel" && clean(p.check_out_date) && ISO.test(p.check_out_date!.trim())) d.check_out = p.check_out_date!.trim();
  if (p.type === "car_rental") {
    set("drop_off_location", p.drop_off_location);
    if (clean(p.drop_off_date) && ISO.test(p.drop_off_date!.trim())) d.drop_off = p.drop_off_date!.trim();
  }
  return d;
}

/**
 * What to look the place up by on Google: the hotel by its name and address;
 * a flight by the airport it lands at (arriving) or leaves from (returning),
 * which the reader puts in `address`.
 */
export function placeQuery(p: ParsedConfirmation): string | null {
  if (isFlight(p.type) || p.type === "car_rental") return clean(p.address);
  const parts = [clean(p.title), clean(p.address)].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** The sub-type the place is saved as, as the map's Add sheet would. */
export function placeSubType(t: ConfirmationType): { type: "logistics" | "food" | "activity"; sub_type: string } {
  if (isFlight(t) || t === "hotel") return { type: "logistics", sub_type: t };
  // Roam has no car category; a pick-up desk is a transit stop, as a station is.
  if (t === "car_rental") return { type: "logistics", sub_type: "transit" };
  if (t === "restaurant") return { type: "food", sub_type: "restaurant" };
  return { type: "activity", sub_type: "self_directed" };
}

/** A hotel's check-out time as a card time, 11 am when the booking does not say. */
export function checkOutTime(p: ParsedConfirmation): string {
  const t = clean(p.check_out_time);
  return t && /^\d{1,2}:\d{2}/.test(t) ? `${t.padStart(5, "0").slice(0, 5)}:00` : "11:00:00";
}

const asTime = (t: string | null | undefined, fallback: string) => {
  const c = clean(t);
  return c && /^\d{1,2}:\d{2}/.test(c) ? `${c.padStart(5, "0").slice(0, 5)}:00` : fallback;
};

/**
 * The second event a booking ends with, when it has one: a hotel's check-out
 * and a rental car's drop-off (1 Oct 2026: "flight, hotel, car" booked in one
 * go). The card is the same place as the first, on the day it names.
 */
export function closingEvent(p: ParsedConfirmation, name: string): { date: string; time: string; title: string } | null {
  const day = (v: string | null | undefined) => (clean(v) && ISO.test(v!.trim()) ? v!.trim() : null);
  if (p.type === "hotel") {
    const date = day(p.check_out_date);
    return date ? { date, time: checkOutTime(p), title: `Check out of ${name}` } : null;
  }
  if (p.type === "car_rental") {
    const date = day(p.drop_off_date);
    const where = clean(p.drop_off_location);
    return date ? { date, time: asTime(p.drop_off_time, "10:00:00"), title: where ? `Return the rental car · ${where}` : "Return the rental car" } : null;
  }
  return null;
}

/** The first event's title: a car's reads as the pick-up. */
export function openingTitle(p: ParsedConfirmation, title: string): string {
  return p.type === "car_rental" && !/pick.?up/i.test(title) ? `Pick up rental car · ${title}` : title;
}
