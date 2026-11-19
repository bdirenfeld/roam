/**
 * Getting to the airport and getting home (19 Nov 2026, Brennan approved the
 * mock; TripIt's "Go Now" and the airport leave-time calculators work this way):
 *
 *   leaving home:  leave = takeoff − how early you want to be there − the drive
 *   coming home:   home  = landing + bags (and customs) + the drive
 *
 * Only on a flight that leaves from, or lands at, your home airport (Profile).
 * How early: 3 h, or 2 h when both airports are in Canada; bags: 1 h after an
 * international flight, 30 min domestic. Each flight can change its own
 * (details.airport_early_min, details.bags_min). The drive is Google's plain
 * drive time (no traffic), saved on the card as details.home_drive.
 */

import { airportCode } from "./airportZones";
import { formatTimeValue } from "@/lib/formatTime";
import { flightsInAir, slices, type FlightCard } from "@/lib/week/flightTime";

/** Canada's airports Roam knows: a flight between two of them is domestic. */
const CANADA = new Set("YYZ YTZ YOW YUL YQB YHM YXU YKF YQT YHZ YFC YSJ YQM YYG YYT YWG YQR YXE YEG YYC YVR YYJ YLW YXX".split(" "));

export type HomeRole = "leaving" | "returning";
/** The drive as saved on the card; traffic: measured with traffic for that weekday and hour (19 Nov 2026). */
export interface HomeDrive { from: string; mins: number; traffic?: boolean }

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}:00`; };
/** On the 5 minutes (his ask, 19 Nov 2026): leaving rounds DOWN (early is safe), home rounds UP. */
export const down5 = (m: number) => Math.floor(m / 5) * 5;
export const up5 = (m: number) => Math.ceil(m / 5) * 5;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** The home airport as a code: "YYZ", "Toronto Pearson (YYZ)" → "YYZ". */
export function homeCode(homeAirport: string | null | undefined): string | null {
  return airportCode(homeAirport ?? null) ?? null;
}

/** Whether this flight leaves from home, comes back to it, or neither. */
export function homeRole(details: unknown, homeAirport: string | null | undefined): HomeRole | null {
  const home = homeCode(homeAirport);
  if (!home) return null;
  const d = (details ?? {}) as Record<string, unknown>;
  const from = airportCode(typeof d.origin_airport === "string" ? d.origin_airport : null);
  const to = airportCode(typeof d.arriving_at === "string" ? d.arriving_at : null);
  if (from === home && to !== home) return "leaving";
  if (to === home && from !== home) return "returning";
  return null;
}

/** Both airports in Canada. */
export function isDomestic(fromCode: string | null, toCode: string | null): boolean {
  return !!fromCode && !!toCode && CANADA.has(fromCode) && CANADA.has(toCode);
}

/** The home drive saved on the card, if it was worked out from this home. */
export function savedDrive(details: unknown, homeKey: string): number | null {
  const h = ((details ?? {}) as Record<string, unknown>).home_drive as HomeDrive | undefined;
  // A drive saved before traffic was asked for (the first day, 21 min to Pearson at 3:30) is asked again.
  return h && h.from === homeKey && h.traffic === true && num(h.mins) != null ? h.mins : null;
}

/** "43.770,-79.410": the home a saved drive was measured from. */
export const homeKeyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export interface LeavingPlan { role: "leaving"; early: number; drive: number | null; atAirport: string; leave: string | null }
export interface ReturningPlan { role: "returning"; bags: number; drive: number | null; land: string; home: string | null }

/**
 * The plan for a home flight: `takeoff` is its departure time, `landing` its
 * arrival (on the home airport's clock); `drive` the minutes to or from home.
 */
export function homePlan(
  role: HomeRole, details: unknown, takeoff: string | null, landing: string | null, drive: number | null,
): LeavingPlan | ReturningPlan | null {
  const d = (details ?? {}) as Record<string, unknown>;
  const from = airportCode(typeof d.origin_airport === "string" ? d.origin_airport : null);
  const to = airportCode(typeof d.arriving_at === "string" ? d.arriving_at : null);
  const domestic = isDomestic(from, to);
  if (role === "leaving") {
    if (!takeoff) return null;
    const early = num(d.airport_early_min) ?? (domestic ? 120 : 180);
    const at = toMin(takeoff) - early;
    return { role, early, drive, atAirport: hhmm(at), leave: drive != null ? hhmm(down5(at - drive)) : null };
  }
  if (!landing) return null;
  const bags = num(d.bags_min) ?? (domestic ? 30 : 60);
  return { role, bags, drive, land: landing.length === 5 ? `${landing}:00` : landing, home: drive != null ? hhmm(up5(toMin(landing) + bags + drive)) : null };
}

/** "3 h", "2 h 30", "45 min". */
export function minsLabel(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
}

/**
 * The week's strips for home flights (19 Nov 2026): leaving, the drive then the
 * time at the airport before takeoff; coming home, bags after landing then the
 * drive. Journey-clock minutes come from lib/week/flightTime (which knows a
 * flight kept on its landing day). The drive shows only once it is on the card.
 */
export function homeBands<C extends FlightCard>(
  days: { id: string; date: string }[], cards: C[], homeAirport: string | null, homeKey: string | null, hourStart: number, hourEnd: number,
): Map<string, { from: number; to: number; kind: "drive" | "airport" | "bags"; label: string | null; card: C }[]> {
  const out = new Map<string, { from: number; to: number; kind: "drive" | "airport" | "bags"; label: string | null; card: C }[]>();
  if (!days.length) return out;
  const put = (start: number, end: number, kind: "drive" | "airport" | "bags", label: string | null, card: C) => {
    for (const sl of slices(days, start, end, hourStart, hourEnd)) {
      const list = out.get(sl.id) ?? [];
      list.push({ from: sl.from, to: sl.to, kind, label: sl.first ? label : null, card });
      out.set(sl.id, list);
    }
  };
  const clock = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return formatTimeValue(`${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}:00`); };
  // Every flight gets its time at the airport before takeoff (19 Nov 2026: the flight home from
  // Pisa had none). Leaving home adds the drive. Coming home is told on the flight's own label
  // (lib/week/flightTime landsHome): it lands on Toronto's clock, after midnight on the trip's.
  for (const f of flightsInAir(days, cards, { home: homeAirport })) {
    const role = homeRole(f.card.details, homeAirport);
    const d = (f.card.details ?? {}) as Record<string, unknown>;
    const from = airportCode(typeof d.origin_airport === "string" ? d.origin_airport : null);
    const to = airportCode(typeof d.arriving_at === "string" ? d.arriving_at : null);
    const early = num(d.airport_early_min) ?? (isDomestic(from, to) ? 120 : 180);
    const at = f.start - early;
    put(at, f.start, "airport", `At the airport · ${minsLabel(early)} before`, f.card);
    const drive = role === "leaving" && homeKey ? savedDrive(f.card.details, homeKey) : null;
    if (drive != null) put(down5(at - drive), at, "drive", `Leave home ${clock(down5(at - drive))}`, f.card);
  }
  return out;
}
