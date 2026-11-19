/**
 * The boarding-pass top of a flight card (19 Nov 2026, Brennan approved the
 * mock: "YYZ 7:45 PM → FCO 10:20 AM · 8 h 35 · next day"). Read from what a
 * flight card already holds: details.origin_airport / arriving_at, the card's
 * start and end times, and its day. Nothing new is stored.
 */

import { airportCode, flightLength } from "./airportZones";
import { placeName } from "@/lib/week/flightTime";

export interface PassEnd { code: string | null; name: string; raw: string }
export interface FlightPassView {
  airline: string | null;
  number: string | null;
  from: PassEnd;
  to: PassEnd;
  /** "HH:MM:SS" as stored, or null. */
  departs: string | null;
  arrives: string | null;
  departDate: string | null;
  arriveDate: string | null;
  nextDay: boolean;
  /** Minutes in the air, when both airports' clocks are known. */
  minutes: number | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

function end(raw: string): PassEnd {
  return { code: airportCode(raw), name: placeName(raw), raw };
}

/** A card gets the pass when it names both airports; "Land in Sydney" (no airports) keeps the old layout. */
export function isPassFlight(details: unknown, subType: string | null | undefined): boolean {
  const d = (details ?? {}) as Record<string, unknown>;
  return (subType === "flight_arrival" || subType === "flight_departure") && !!str(d.origin_airport) && !!str(d.arriving_at);
}

/**
 * What the pass shows. `landing` is the time a two-card flight lands (its
 * landing card's start), used when this card has no end of its own.
 */
export function flightPass(card: { details: unknown; start_time: string | null; end_time: string | null }, dayDate: string | null, landing: string | null = null): FlightPassView {
  const d = (card.details ?? {}) as Record<string, unknown>;
  const from = end(str(d.origin_airport) ?? ""), to = end(str(d.arriving_at) ?? "");
  const departs = card.start_time, arrives = card.end_time ?? landing;
  let minutes: number | null = null, arriveDate: string | null = null;
  if (departs && arrives && dayDate) {
    const len = flightLength(from.code, to.code, dayDate, toMin(departs), toMin(arrives));
    if (len) { minutes = len.minutes; arriveDate = len.landsOn; }
    else arriveDate = toMin(arrives) <= toMin(departs) ? addDays(dayDate, 1) : dayDate;
  }
  const number = str(d.flight_number)?.replace(/^([A-Z0-9]{2})\s*(\d+)$/i, (_, a: string, n: string) => `${a.toUpperCase()} ${n}`) ?? null;
  return {
    airline: str(d.airline)?.replace(/\s*\((Canada)\)\s*Ltd\.?$/i, "").replace(/\s+Ltd\.?$/i, "") ?? null,
    number, from, to, departs, arrives,
    departDate: dayDate, arriveDate,
    nextDay: !!(arriveDate && dayDate && arriveDate > dayDate),
    minutes,
  };
}

/** "Wed 22 Apr". */
export function passDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
