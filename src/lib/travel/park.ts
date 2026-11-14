/**
 * Drive, park, walk (Brennan, 14 Nov 2026, step 3 of the travel card plan).
 * Many towns — Lucca inside its walls, most Italian old towns — can't be
 * driven into. So a drive to a place that is not itself a car park offers a
 * third way: drive to the nearest car park, then walk. The app finds car parks
 * near the place (Google Places, type "parking"), and Google times the drive to
 * the car park and the walk from it.
 *
 *   details.park = { title, lat, lng, address?, google_place_id?, drive, walk }
 *
 * No source says which towns ban cars, so the card never claims one does: for a
 * place in Italy it carries one line asking to check the car park is outside
 * the restricted zone (ZTL).
 */

export interface Park {
  title: string;
  lat: number;
  lng: number;
  address?: string | null;
  google_place_id?: string | null;
  /** Minutes driving from the start to the car park. */
  drive: number;
  /** Minutes walking from the car park to where you're going. */
  walk: number;
}

/** A car park this close or closer; past it the walk is the trip. */
export const PARK_MAX_KM = 1.2;
/** At most this many to choose between. */
export const PARK_CHOICES = 3;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** details.park, when it is a usable car park with both times. */
export function readPark(details: unknown): Park | null {
  const p = (details as Record<string, unknown> | null)?.park as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const lat = num(p.lat), lng = num(p.lng), drive = num(p.drive), walk = num(p.walk);
  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (lat == null || lng == null || drive == null || walk == null || !title || drive <= 0 || walk < 0) return null;
  return {
    title, lat, lng, drive: Math.round(drive), walk: Math.round(walk),
    ...(typeof p.address === "string" && p.address ? { address: p.address } : {}),
    ...(typeof p.google_place_id === "string" ? { google_place_id: p.google_place_id } : {}),
  };
}

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface ParkSpot { title: string; lat: number; lng: number; address: string | null; google_place_id: string | null }

/**
 * Car parks out of a Google Nearby Search answer (nearest first, as asked):
 * within PARK_MAX_KM of where you're going, closed-for-good ones dropped, at
 * most PARK_CHOICES.
 */
export function parkSpots(json: unknown, to: { lat: number; lng: number }): ParkSpot[] {
  const results = ((json as { results?: unknown[] } | null)?.results ?? []) as Record<string, unknown>[];
  const out: ParkSpot[] = [];
  for (const r of results) {
    const loc = (r.geometry as { location?: { lat?: number; lng?: number } } | undefined)?.location;
    const lat = num(loc?.lat), lng = num(loc?.lng);
    const title = typeof r.name === "string" ? r.name.trim() : "";
    if (lat == null || lng == null || !title) continue;
    if (r.business_status === "CLOSED_PERMANENTLY") continue;
    if (km({ lat, lng }, to) > PARK_MAX_KM) continue;
    out.push({ title, lat, lng, address: typeof r.vicinity === "string" ? r.vicinity : null, google_place_id: typeof r.place_id === "string" ? r.place_id : null });
    if (out.length >= PARK_CHOICES) break;
  }
  return out;
}

/** Door to door: the drive, then the walk. */
export function parkMinutes(p: Pick<Park, "drive" | "walk">): number {
  return p.drive + p.walk;
}

/** A place in Italy, by its address: the ZTL line applies. */
export function inItaly(address: string | null | undefined): boolean {
  return !!address && /\b(Italy|Italia)\b/i.test(address);
}

/** Where you're going is itself somewhere to park or catch a train: no park-and-walk. */
export function isParkOrStation(name: string): boolean {
  return /\b(station|stazione|gare|bahnhof|car ?park|parking|parcheggio|port|porto|ferry|terminal|bus stop|metro)\b/i.test(name);
}

export const ZTL_LINE = "Italian old towns often ban cars (ZTL). Check the car park is outside the zone.";
