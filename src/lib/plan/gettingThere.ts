/**
 * Getting there: one travel card before each day trip Plan my trip lays out
 * (30 Sep 2026). Brennan: a logistics card "on how to get to those places,
 * knowing where the home base is" — and "it should also optimize the best way
 * to get there and provide details on how to do it".
 *
 * A day trip is a planned place more than NEAR_KM from that night's stay
 * (lib/plan/pace); only the day's first such place gets the card — the rest
 * of that day is around it. Google Directions gives the drive and the public
 * transport route (api/plan/getting-there); this module chooses between them
 * and writes the card. Pure.
 *
 * Choosing: door-to-door minutes, with a quarter hour for parking on a drive
 * and ten minutes a change on public transport with children (five without).
 * Without a car saved on the journey (a rental), driving must also be a lot
 * quicker — a third — to win: Rome to Tivoli is 46 minutes by car and 69 by
 * metro and bus, and a family in Rome has no car.
 * Google has no public transport data for some places (Japan, rural Costa
 * Rica); the card then says so and points to Google Maps, which has it.
 */

import { agendaOrder } from "@/lib/agendaOrder";

export interface RouteStep {
  kind: "walk" | "ride";
  /** BUS, SUBWAY, HEAVY_RAIL, TRAM, FERRY, … */
  vehicle?: string;
  line?: string;
  from?: string;
  to?: string;
  stops?: number;
  minutes: number;
  /** A ride's timetabled departure, epoch seconds (28 Nov 2026, lib/travel/ways). */
  dep?: number;
  /** Where a ride gets off, so a drive-then-train way can name and pin the station. */
  toPt?: { lat: number; lng: number };
}
/** `dep`: when the route sets off, epoch seconds (transit answers carry it). */
export interface Route { minutes: number; km: number; steps: RouteStep[]; dep?: number }

const PARKING_MIN = 15;
/** Nobody leaves before this: the day moves later instead. */
export const EARLIEST_LEAVE = 8 * 60;
/** Ten minutes to get out of the door. */
const DOOR_MIN = 10;

type GLoc = { lat?: number; lng?: number };
type GStep = { travel_mode?: string; duration?: { value?: number }; transit_details?: { line?: { short_name?: string; name?: string; vehicle?: { type?: string } }; departure_stop?: { name?: string; location?: GLoc }; arrival_stop?: { name?: string; location?: GLoc }; num_stops?: number; departure_time?: { value?: number } } };
type GLeg = { duration?: { value?: number }; distance?: { value?: number }; steps?: GStep[]; departure_time?: { value?: number } };

/**
 * Minutes with traffic (19 Nov 2026, the drive to the airport): Google's
 * duration_in_traffic, which it returns for a driving request with a
 * departure_time; null when the answer has none.
 */
export function trafficMinutes(json: unknown): number | null {
  const j = json as { status?: string; routes?: { legs?: { duration_in_traffic?: { value?: number } }[] }[] } | null;
  const v = j?.status === "OK" ? j.routes?.[0]?.legs?.[0]?.duration_in_traffic?.value : undefined;
  return typeof v === "number" && v > 0 ? Math.round(v / 60) : null;
}

/** Faster than this between two stops is bad timetable data, not a ride (28 Nov 2026: Google's
 *  "bus Lucca 8:35 → Pontedera 8:40", 40 km in 5 minutes). Road and rail, km/h. */
const MAX_ROAD_KMH = 110;
const MAX_RAIL_KMH = 250;

function kmApart(a: GLoc, b: GLoc): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat! - a.lat!) * rad, dLng = (b.lng! - a.lng!) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * rad) * Math.cos(b.lat! * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** A ride Google times faster than any bus or train could go between its two stops. */
export function impossibleRide(s: GStep): boolean {
  const t = s.transit_details;
  const a = t?.departure_stop?.location, b = t?.arrival_stop?.location;
  const secs = s.duration?.value ?? 0;
  if (s.travel_mode !== "TRANSIT" || !a || !b || typeof a.lat !== "number" || typeof a.lng !== "number" || typeof b.lat !== "number" || typeof b.lng !== "number") return false;
  const km = kmApart(a, b);
  if (km < 3) return false;
  const kmh = km / Math.max(secs, 30) * 3600;
  const road = /BUS|TROLLEY|SHARE_TAXI/.test(t?.line?.vehicle?.type ?? "");
  return kmh > (road ? MAX_ROAD_KMH : MAX_RAIL_KMH);
}

/** Google Directions JSON to a route, or null when there is none. With alternatives asked for,
 *  the first route with no impossible ride (impossibleRide) wins. */
export function routeFrom(json: unknown): Route | null {
  const j = json as { status?: string; routes?: { legs?: GLeg[] }[] } | null;
  const legs = j?.status === "OK" ? (j.routes ?? []).map((r) => r.legs?.[0]).filter((l): l is GLeg => !!l) : [];
  const leg = legs.find((l) => !(l.steps ?? []).some(impossibleRide));
  if (!leg?.duration?.value) return null;
  const steps: RouteStep[] = (leg.steps ?? []).map((s) => {
    const m = Math.round((s.duration?.value ?? 0) / 60);
    const t = s.transit_details;
    if (s.travel_mode === "TRANSIT" && t) {
      const loc = t.arrival_stop?.location;
      return {
        kind: "ride", vehicle: t.line?.vehicle?.type, line: t.line?.short_name || t.line?.name, from: t.departure_stop?.name, to: t.arrival_stop?.name, stops: t.num_stops, minutes: m,
        ...(typeof t.departure_time?.value === "number" ? { dep: t.departure_time.value } : {}),
        ...(typeof loc?.lat === "number" && typeof loc?.lng === "number" ? { toPt: { lat: loc.lat, lng: loc.lng } } : {}),
      };
    }
    return { kind: "walk", minutes: m };
  });
  return {
    minutes: Math.round(leg.duration.value / 60), km: Math.round((leg.distance?.value ?? 0) / 100) / 10, steps,
    ...(typeof leg.departure_time?.value === "number" ? { dep: leg.departure_time.value } : {}),
  };
}

export function changes(r: Route): number {
  return Math.max(0, r.steps.filter((s) => s.kind === "ride").length - 1);
}

/** The better way, by door-to-door minutes with parking and changes counted. */
export function bestWay(drive: Route | null, transit: Route | null, kids: boolean, car = false): "drive" | "transit" | null {
  if (!drive && !transit) return null;
  if (!transit) return "drive";
  if (!drive) return "transit";
  const t = transit.minutes + changes(transit) * (kids ? 10 : 5);
  const d = drive.minutes + PARKING_MIN;
  return t <= (car ? d : d * 1.5) ? "transit" : "drive";
}

const CAR = /\b(car rental|rent a car|rental car|car hire|hertz|avis|enterprise rent|europcar|sixt|budget car|alamo|national car|thrifty|dollar car|hire car)\b/i;
/** A car on the journey: a saved rental, by name or Google's type. */
export function hasCar(cards: { place: { title?: string | null; types?: unknown; details?: unknown } | null }[]): boolean {
  return cards.some((c) => {
    const p = c.place; if (!p) return false;
    const types = p.types ?? (p.details as { types?: unknown } | null)?.types;
    return CAR.test(p.title ?? "") || (Array.isArray(types) && types.includes("car_rental"));
  });
}

export function hm(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
export function clock(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const VEHICLE: Record<string, string> = { BUS: "bus", INTERCITY_BUS: "coach", TROLLEYBUS: "bus", SUBWAY: "metro", METRO_RAIL: "metro", HEAVY_RAIL: "train", COMMUTER_TRAIN: "train", HIGH_SPEED_TRAIN: "high-speed train", LONG_DISTANCE_TRAIN: "train", RAIL: "train", TRAM: "tram", LIGHT_RAIL: "tram", MONORAIL: "monorail", FERRY: "ferry", CABLE_CAR: "cable car", FUNICULAR: "funicular", GONDOLA_LIFT: "gondola" };

/** "Metro B from Termini to Ponte Mammolo (9 stops, 15 min)". */
export function stepLine(s: RouteStep): string {
  const what = VEHICLE[s.vehicle ?? ""] ?? "public transport";
  const line = s.line ? `${what} ${s.line}` : what;
  const stops = s.stops ? `${s.stops} ${s.stops === 1 ? "stop" : "stops"}, ` : "";
  return `${line[0].toUpperCase()}${line.slice(1)} from ${s.from ?? "?"} to ${s.to ?? "?"} (${stops}${hm(s.minutes)})`;
}

/** When to leave for a place that starts at `start`, and how far the day must move if that is too early. */
export function leaveBy(start: number, minutes: number): { leave: number; shift: number } {
  const ideal = Math.floor((start - minutes - DOOR_MIN) / 5) * 5;
  return ideal >= EARLIEST_LEAVE ? { leave: ideal, shift: 0 } : { leave: EARLIEST_LEAVE, shift: EARLIEST_LEAVE - ideal };
}

export function directionsUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: "drive" | "transit"): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=${mode === "drive" ? "driving" : "transit"}`;
}

/** The travel card's title and note. */
export function travelCard(o: { to: string; home: string; drive: Route | null; transit: Route | null; kids: boolean; car?: boolean; leave: number }): { title: string; notes: string; mode: "drive" | "transit" } | null {
  const best = bestWay(o.drive, o.transit, o.kids, o.car);
  if (!best) return null;
  const r = (best === "drive" ? o.drive : o.transit)!;
  const lines: string[] = [];
  if (best === "drive") {
    lines.push(`Drive from ${o.home}: about ${hm(r.minutes)} (${Math.round(r.km)} km). Leave by ${clock(o.leave)}.`);
    // No rental saved: say what driving takes.
    if (!o.car) lines.push("You'll need a car, a taxi or a driver for this one.");
    lines.push("Allow time to park when you get there.");
  } else {
    lines.push(`By public transport from ${o.home}: about ${hm(r.minutes)}. Leave by ${clock(o.leave)}.`);
    for (const s of r.steps) {
      if (s.kind === "ride") lines.push(`• ${stepLine(s)}`);
      else if (s.minutes >= 3) lines.push(`• Walk ${hm(s.minutes)}`);
    }
    const n = changes(r);
    if (n) lines.push(`${n} ${n === 1 ? "change" : "changes"}.`);
  }
  lines.push("");
  if (best === "drive" && o.transit) lines.push(`Public transport instead: about ${hm(o.transit.minutes)}${changes(o.transit) ? `, ${changes(o.transit)} ${changes(o.transit) === 1 ? "change" : "changes"}` : ""}.`);
  if (best === "drive" && !o.transit) lines.push("Public transport: Google has no route for here. Tap Directions and switch to transit in Google Maps to check.");
  if (best === "transit" && o.drive) lines.push(`Driving instead: about ${hm(o.drive.minutes)} (${Math.round(o.drive.km)} km), plus parking.`);
  lines.push(`Back to ${o.home}: about ${hm(r.minutes)}.`);
  return { title: `Getting to ${o.to}`, notes: lines.join("\n"), mode: best };
}

export interface TripCard {
  id: string; day_id: string | null; start_time: string | null; end_time?: string | null; position: number | null;
  details?: Record<string, unknown> | null;
  place: { title: string; type: string | null; sub_type: string | null; lat: number | null; lng: number | null } | null;
}
export interface DayTrip { dayId: string; target: TripCard; home: TripCard }

/**
 * The day trips among what was just planned: per day, the first planned
 * place (by time) more than NEAR_KM from that night's stay — the last stay
 * checked into on or before the day, as lib/week/dayPlan stayAnchor. A day
 * that already has a travel card is left alone.
 */
export function dayTrips(dayIds: string[], cards: TripCard[], planned: Set<string>, nearKm: number, km: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number): DayTrip[] {
  const stays = cards.filter((c) => (c.place?.sub_type === "hotel" || c.place?.sub_type === "accommodation") && c.place.lat != null && c.place.lng != null && c.day_id);
  const out: DayTrip[] = [];
  dayIds.forEach((dayId, at) => {
    const on = cards.filter((c) => c.day_id === dayId);
    if (on.some((c) => c.details && (c.details as { getting_there?: unknown }).getting_there)) return;
    let home: TripCard | null = null, hi = -1;
    for (const s of stays) { const i = dayIds.indexOf(s.day_id!); if (i >= 0 && i <= at && i >= hi) { hi = i; home = s; } }
    if (!home) return;
    const h = { lat: home.place!.lat!, lng: home.place!.lng! };
    const far = on
      .filter((c) => planned.has(c.id) && c.place?.type === "activity" && c.start_time && c.place.lat != null && c.place.lng != null && km(h, { lat: c.place.lat!, lng: c.place.lng! }) > nearKm)
      .sort((a, b) => agendaOrder({ ...a, end_time: a.end_time ?? null, details: a.details ?? null }, { ...b, end_time: b.end_time ?? null, details: b.details ?? null }));
    if (far[0]) out.push({ dayId, target: far[0], home });
  });
  return out;
}
