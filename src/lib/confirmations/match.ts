import type { ParsedConfirmation } from "./toCards";

/**
 * Which booking in an attached confirmation is the card's own (1 Oct 2026).
 * An Expedia package is a flight out, a flight home, a hotel and a car in one
 * email; the airport pin it was attached to is one of them, the rest are
 * offered to add. Same kind first (the arriving flight for an arrival pin),
 * then any flight for a flight pin. -1 when none fits.
 */
export function matchBooking(subType: string | null | undefined, bookings: ParsedConfirmation[]): number {
  if (!subType) return -1;
  const exact = bookings.findIndex((b) => b.type === subType);
  if (exact >= 0) return exact;
  if (subType === "flight_arrival" || subType === "flight_departure") return bookings.findIndex((b) => b.type === "flight_arrival" || b.type === "flight_departure");
  if (subType === "transit") return bookings.findIndex((b) => b.type === "car_rental");
  return -1;
}

/** The other bookings in the email, to offer after the card's own is applied. */
export function otherBookings(bookings: ParsedConfirmation[], matched: number): ParsedConfirmation[] {
  return bookings.filter((_, i) => i !== matched);
}
