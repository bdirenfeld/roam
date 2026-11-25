/**
 * The three booking marks on a journey's card on Journeys (25 Nov 2026, mock
 * approved): flights, stays, car, each booked or still to book. The same rows
 * as Bookings (checklistRows is the one reader), so the card and the sheet can
 * never disagree. A row the owner marked "Not needed" has no mark at all.
 */

import { checklistRows, type CheckInput, type CheckRow, type RowKey } from "./checklist";

export interface BookingMark {
  key: RowKey;
  booked: boolean;
}

const NAMES: Record<RowKey, string> = { flights: "Flights", stays: "Stays", car: "Car" };

/** The marks for a journey's rows, in row order; "not needed" rows are left out. */
export function bookingMarks(rows: Pick<CheckRow, "key" | "state">[]): BookingMark[] {
  return rows.filter((r) => r.state !== "skip").map((r) => ({ key: r.key, booked: r.state === "booked" }));
}

/** Straight from a journey: its days, the cards on them and the owner's own choices. */
export function tripMarks(input: CheckInput): BookingMark[] {
  return bookingMarks(checklistRows({ ...input, airports: null }));
}

/** One mark in words, for the tooltip: "Flights: booked", "Car: still to book". */
export function markLabel(m: BookingMark): string {
  return `${NAMES[m.key]}: ${m.booked ? "booked" : "still to book"}`;
}

/** The whole set in words, for the link's name: "Bookings for Tuscany: flights booked, …". */
export function marksLabel(title: string, marks: BookingMark[]): string {
  const said = marks.map((m) => `${NAMES[m.key].toLowerCase()} ${m.booked ? "booked" : "still to book"}`);
  return `Bookings for ${title}: ${said.join(", ")}`;
}

/**
 * Where a click on the marks goes: the journey with Bookings open. A computer
 * opens the week (WeekBoard reads ?bookings=1); a phone opens the day it would
 * have opened anyway (DayViewClient reads the same flag).
 */
export function bookingsHref(tripId: string, phoneDayId?: string | null): string {
  return phoneDayId ? `/trips/${tripId}/days/${phoneDayId}?bookings=1` : `/trips/${tripId}/plan?bookings=1`;
}

/**
 * Reads the ?bookings=1 flag off an address: whether to open Bookings, and the
 * address without the flag, so a reload or a closed sheet does not bring it back.
 */
export function takeBookingsFlag(href: string): { open: boolean; clean: string } {
  const u = new URL(href, "http://roam.local");
  const open = u.searchParams.get("bookings") === "1";
  u.searchParams.delete("bookings");
  return { open, clean: u.pathname + u.search + u.hash };
}
