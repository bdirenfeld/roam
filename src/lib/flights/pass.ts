/**
 * The boarding-pass top of a flight card (19 Nov 2026, Brennan approved the
 * mock: "YYZ 7:45 PM → FCO 10:20 AM · 8 h 35 · next day"). Read from what a
 * flight card already holds: details.origin_airport / arriving_at, the card's
 * start and end times, and its day. Nothing new is stored.
 */

import { airportCode, flightLength } from "./airportZones";
import { placeName } from "@/lib/week/flightTime";
import { storedOnLandingDay } from "@/lib/cardTime";

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

/** The airlines his journeys fly, by the name a confirmation gives (27 Nov 2026). */
const AIRLINE_CODES: [RegExp, string][] = [
  [/^american\b/i, "AA"], [/^air canada\b/i, "AC"], [/^united\b/i, "UA"], [/^delta\b/i, "DL"], [/^westjet\b/i, "WS"],
  [/^porter\b/i, "PD"], [/^air transat\b/i, "TS"], [/^flair\b/i, "F8"], [/^alaska\b/i, "AS"], [/^southwest\b/i, "WN"],
  [/^jetblue\b/i, "B6"], [/^spirit\b/i, "NK"], [/^frontier\b/i, "F9"], [/^british airways\b/i, "BA"], [/^lufthansa\b/i, "LH"],
  [/^air france\b/i, "AF"], [/^klm\b/i, "KL"], [/^ita\b/i, "AZ"], [/^alitalia\b/i, "AZ"], [/^aer lingus\b/i, "EI"],
  [/^iberia\b/i, "IB"], [/^swiss\b/i, "LX"], [/^emirates\b/i, "EK"], [/^qatar\b/i, "QR"], [/^turkish\b/i, "TK"],
  [/^aerom[eé]xico\b/i, "AM"], [/^icelandair\b/i, "FI"], [/^tap\b/i, "TP"], [/^virgin atlantic\b/i, "VS"], [/^copa\b/i, "CM"],
];

/**
 * The flight number as a pass prints it: "AC890" → "AC 890"; a bare "1993" on
 * American Airlines → "AA 1993". A number with no letters is never split: it
 * read "19 93" (27 Nov 2026, his phone).
 */
export function flightNumberLabel(raw: unknown, airline: unknown): string | null {
  const n = str(raw);
  if (!n) return null;
  const coded = n.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])\s*(\d{1,4})$/i);
  if (coded) return `${coded[1].toUpperCase()} ${coded[2]}`;
  if (/^\d{1,4}$/.test(n)) {
    const name = str(airline);
    const code = name ? AIRLINE_CODES.find(([re]) => re.test(name))?.[1] : null;
    return code ? `${code} ${n}` : n;
  }
  return n;
}

/**
 * What the pass shows. `landing` is the time a two-card flight lands (its
 * landing card's start), used when this card has no end of its own.
 */
export function flightPass(card: { details: unknown; start_time: string | null; end_time: string | null; place?: { sub_type?: string | null } | null }, cardDate: string | null, landing: string | null = null): FlightPassView {
  const d = (card.details ?? {}) as Record<string, unknown>;
  const from = end(str(d.origin_airport) ?? ""), to = end(str(d.arriving_at) ?? "");
  const departs = card.start_time, arrives = card.end_time ?? landing;
  // A flight kept on the day it lands (Rome AC890 on Wed 22 Apr) took off the day before.
  const onLanding = storedOnLandingDay({ ...card, place: card.place ? { sub_type: card.place.sub_type ?? null } : null });
  const dayDate = cardDate && onLanding ? addDays(cardDate, -1) : cardDate;
  let minutes: number | null = null, arriveDate: string | null = null;
  if (departs && arrives && dayDate) {
    const len = flightLength(from.code, to.code, dayDate, toMin(departs), toMin(arrives));
    if (len) { minutes = len.minutes; arriveDate = len.landsOn; }
    else arriveDate = toMin(arrives) <= toMin(departs) ? addDays(dayDate, 1) : dayDate;
  }
  const number = flightNumberLabel(d.flight_number, d.airline);
  return {
    airline: str(d.airline)?.replace(/\s*\((Canada)\)\s*Ltd\.?$/i, "").replace(/\s+Ltd\.?$/i, "") ?? null,
    number, from, to, departs, arrives,
    departDate: dayDate, arriveDate,
    nextDay: !!(arriveDate && dayDate && arriveDate > dayDate),
    minutes,
  };
}

/**
 * What to look up for a typed airport (19 Nov 2026, live test): "Naples NAP"
 * on its own found the city of Naples, so the card sat in town. "Naples NAP
 * airport" finds the airport; a name that already says airport is left alone.
 */
export function airportSearch(s: string): string {
  const t = s.trim();
  return /\b(airport|aeroporto|aeropuerto|a[ée]roport|flughafen)\b/i.test(t) ? t : `${t} airport`;
}

/** "Wed 22 Apr". */
export function passDate(iso: string): string {
  // Spelled by hand: ICU writes "Sept" in some browsers (seen live, 19 Nov 2026).
  const d = new Date(iso + "T12:00:00Z");
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}
