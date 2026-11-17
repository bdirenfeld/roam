/**
 * A booking added by hand (17 Nov 2026, Don's cruise PDF would not read; flow
 * approved by Brennan as five frames). The "Your bookings" sheet is the one an
 * upload opens; when a file cannot be read, or there is no file, it opens
 * empty, and Flight / Hotel / Car / Cruise each add a row to fill in. Several of
 * each, as many as the trip has. These rules give each new row a sensible start.
 */

import type { ParsedConfirmation } from "./toCards";

export type HandKind = "flight" | "hotel" | "car" | "cruise";

const blank = (type: ParsedConfirmation["type"]): ParsedConfirmation => ({
  type, title: "", confirmation_number: null, date: null, time: null, end_time: null,
  address: null, phone: null, website: null, notes: null,
});

/**
 * A new row of `kind`, starting from what is already on the list:
 * - a flight after a flight is the way home: from and to swapped, the last day;
 * - a hotel after a hotel checks in the day the last one checks out;
 * - otherwise the journey's first day, and its last for check-out / return.
 */
export function blankBooking(kind: HandKind, list: ParsedConfirmation[], tripStart: string, tripEnd: string): ParsedConfirmation {
  if (kind === "flight") {
    const prior = [...list].reverse().find((p) => (p.type === "flight_arrival" || p.type === "flight_departure") && (p.origin_airport || p.arriving_at));
    if (prior) {
      return { ...blank("flight_departure"), date: tripEnd, origin_airport: prior.arriving_at ?? null, arriving_at: prior.origin_airport ?? null, address: prior.arriving_at ?? null };
    }
    return { ...blank("flight_arrival"), date: tripStart };
  }
  if (kind === "hotel") {
    const last = [...list].reverse().find((p) => p.type === "hotel" && p.check_out_date);
    return { ...blank("hotel"), date: last?.check_out_date ?? tripStart, check_out_date: tripEnd };
  }
  if (kind === "car") return { ...blank("car_rental"), date: tripStart, drop_off_date: tripEnd };
  return { ...blank("cruise"), date: tripStart, check_out_date: tripEnd };
}

/** A hand-added flight's title: "AC 890 · YYZ → KEF", whatever of it is filled in. */
export function flightTitle(p: Pick<ParsedConfirmation, "flight_number" | "origin_airport" | "arriving_at">): string {
  const num = (p.flight_number ?? "").trim();
  const from = (p.origin_airport ?? "").trim(), to = (p.arriving_at ?? "").trim();
  const route = from || to ? `${from || "?"} → ${to || "?"}` : "";
  return [num, route].filter(Boolean).join(" · ");
}

/**
 * A hand-added flight's card sits at the airport you land at going out, and
 * the one you leave from coming home (the reader's own convention).
 */
export function flightAirport(p: Pick<ParsedConfirmation, "type" | "origin_airport" | "arriving_at">): string | null {
  const a = p.type === "flight_departure" ? p.origin_airport : p.arriving_at;
  return a && a.trim() ? a.trim() : null;
}
