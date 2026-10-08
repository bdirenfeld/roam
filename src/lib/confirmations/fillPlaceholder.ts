/**
 * An uploaded booking that is already on the day (6 Oct 2026; placeholders
 * 7 Oct 2026, copy to new dates). The same place on the same day is not added
 * twice: the card already there becomes the booked one.
 *
 *   - Already booked: as before, it is marked booked and only a missing time
 *     is filled in.
 *   - A placeholder (not booked yet, e.g. the copied "11 Howard · to book"):
 *     it takes the booking's times and its booking details — flight number,
 *     confirmation, seat, check-out, the price on the opening card — and stops
 *     being "to book".
 *
 * A flight matches by kind (arriving / leaving) and airport, so last year's
 * placeholder takes this year's flight even though the flight number changed.
 */

import { isFlight, type ConfirmationType } from "./toCards";

export interface DayCard {
  id: string;
  place_id: string | null;
  status: string;
  confirmed?: boolean | null;
  start_time: string | null;
  end_time: string | null;
  details?: Record<string, unknown> | null;
  place?: { sub_type?: string | null; google_place_id?: string | null } | null;
}

export interface NewCard {
  place_id: string | null;
  start_time: string | null;
  end_time: string | null;
  details: Record<string, unknown>;
  place?: { sub_type?: string | null; google_place_id?: string | null } | null;
}

/** What a booking carries that a placeholder lacks. */
const BOOKING_KEYS = [
  "confirmation", "airline", "flight_number", "origin_airport", "arriving_at", "seat",
  "check_out", "drop_off", "drop_off_location", "paid_total", "paid_currency", "phone", "website",
];

const samePlace = (a: DayCard, b: NewCard) =>
  (!!a.place_id && a.place_id === b.place_id) ||
  (!!a.place?.google_place_id && a.place.google_place_id === b.place?.google_place_id);

/** The card on that day this booking is, or null to add it as new. */
export function existingFor(card: NewCard, kind: ConfirmationType, dayCards: DayCard[]): DayCard | null {
  if (!card.place_id) return null;
  const on = dayCards.filter((x) => x.status === "in_itinerary" && samePlace(x, card));
  if (isFlight(kind)) {
    const sameKind = on.find((x) => x.place?.sub_type === kind);
    if (sameKind) return sameKind;
  }
  return on[0] ?? null;
}

/** The write that turns `there` into the booked card, and the card as it will read. */
export function fillFrom(there: DayCard, card: NewCard): { patch: Record<string, unknown>; card: DayCard } {
  if (there.confirmed === true) {
    const patch = { confirmed: true, start_time: there.start_time ?? card.start_time, end_time: there.end_time ?? card.end_time };
    return { patch, card: { ...there, ...patch } };
  }
  const details: Record<string, unknown> = { ...(there.details ?? {}) };
  for (const k of BOOKING_KEYS) if (card.details[k] != null && card.details[k] !== "") details[k] = card.details[k];
  delete details.to_book;
  const patch = {
    confirmed: true,
    start_time: card.start_time ?? there.start_time,
    end_time: card.end_time ?? there.end_time,
    details,
  };
  return { patch, card: { ...there, ...patch } };
}
