/**
 * Flights against the hotel's hours (27 Nov 2026, Brennan; mock approved, the
 * simple version: "this has happened to me before in New York and it's going
 * to happen right now for Dallas").
 *
 *  - You land well before check-in: New York, LGA 10:55 AM, 11 Howard from
 *    2:00 PM. Said when the landing is EARLY_MIN or more before check-in, on
 *    the check-in day.
 *  - You fly well after check-out: you'd leave for the airport AIRPORT_LEAD
 *    before takeoff; said when that is LATE_MIN or more after check-out.
 *
 * Times are each city's own clock, as the cards are entered (lib/week/flightTime);
 * the flight's moment comes from flightsInAir, so a two-card flight, an
 * overnight one and one entered twice all count once. A hotel with no
 * check-in time says nothing; one with no check-out time is taken as 11 AM.
 */
import { flightsInAir, type FlightCard } from "@/lib/week/flightTime";

type Day = { id: string; date: string };

/** Land this long (minutes) before check-in, or more, and it is said. */
export const EARLY_MIN = 180;
/** How long before takeoff you leave the hotel: two hours at the airport, about one getting there. */
export const AIRPORT_LEAD = 180;
/** Leave this long (minutes) after check-out, or more, and it is said. */
export const LATE_MIN = 120;
/** A hotel with no check-out time written. */
export const DEFAULT_CHECKOUT = "11:00";

export interface StayTimes {
  checkInDate: string;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
}
export interface ArriveGap { cardId: string; land: string; hours: number }
export interface LeaveGap { cardId: string; flight: string; leaveAt: string; hours: number; checkOut: string }

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (moment: number) => {
  const m = ((moment % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const TIME = /^\d{2}:\d{2}/;

/** "10:55 AM" from "10:55" or "10:55:00". */
export function clock(t: string): string {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Both gaps for one stay, or null where there is nothing to say. */
export function stayGaps(days: Day[], flights: FlightCard[], stay: StayTimes): { arrive: ArriveGap | null; leave: LeaveGap | null } {
  if (!days.length) return { arrive: null, leave: null };
  const first = Math.min(...days.map((d) => Date.parse(d.date + "T00:00:00Z")));
  const dayNum = (date: string | null) => {
    if (!date || !days.some((d) => d.date === date)) return null;
    return Math.round((Date.parse(date + "T00:00:00Z") - first) / 86_400_000);
  };
  const spans = flightsInAir(days, flights);

  let arrive: ArriveGap | null = null;
  const inDay = dayNum(stay.checkInDate);
  if (inDay !== null && stay.checkInTime && TIME.test(stay.checkInTime)) {
    const checkIn = inDay * 1440 + toMin(stay.checkInTime);
    // The last landing that day, before check-in.
    const landed = spans.filter((s) => !s.landsHome && Math.floor(s.end / 1440) === inDay && s.end < checkIn).sort((a, b) => b.end - a.end)[0];
    if (landed && checkIn - landed.end >= EARLY_MIN) {
      arrive = { cardId: (landed.landing ?? landed.card).id, land: hhmm(landed.end), hours: Math.floor((checkIn - landed.end) / 60) };
    }
  }

  let leave: LeaveGap | null = null;
  const outDay = dayNum(stay.checkOutDate);
  if (outDay !== null) {
    const outTime = stay.checkOutTime && TIME.test(stay.checkOutTime) ? stay.checkOutTime.slice(0, 5) : DEFAULT_CHECKOUT;
    const checkOut = outDay * 1440 + toMin(outTime);
    // The first takeoff that day, after check-out.
    const flight = spans.filter((s) => Math.floor(s.start / 1440) === outDay && s.start > checkOut).sort((a, b) => a.start - b.start)[0];
    if (flight) {
      const leaveAt = flight.start - AIRPORT_LEAD;
      if (leaveAt - checkOut >= LATE_MIN) {
        leave = { cardId: flight.card.id, flight: hhmm(flight.start), leaveAt: hhmm(leaveAt), hours: Math.floor((leaveAt - checkOut) / 60), checkOut: outTime };
      }
    }
  }
  return { arrive, leave };
}

/** The day list's one orange line, by card id: on the hotel the day you land, on the flight the day you leave. Short enough to sit beside the Booked badge at 375 px (27 Nov 2026: "You land 3 h before check-in" was cut off). */
export function dayGapFlags(gaps: { arrive: ArriveGap | null; leave: LeaveGap | null }, hotelCardId: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (gaps.arrive) out[hotelCardId] = `You land ${gaps.arrive.hours} h early`;
  if (gaps.leave) out[gaps.leave.cardId] = "Late check-out?";
  return out;
}
