import type { FindResult } from "./merge";

/**
 * Concerts and shows from Ticketmaster's Discovery API (1 Oct 2026). Events
 * came only from each area's yearly list (lib/find/yearly) — festivals, palios
 * — and one-off concerts had just a "see what's on" link. Ticketmaster's key
 * is free (5,000 calls a day), so this is Find's Google half for Event.
 * Strong in North America and the UK, thin in Italy (TicketOne sells most).
 *
 * A venue is not a Google place, so its placeId is "tm:<id>" and Save looks
 * the venue up then (FindSheet), not for every event shown.
 */

export const TM_RADIUS_KM = 80;

export function ticketmasterUrl(key: string, at: { lat: number; lng: number }, from: string, to: string): string {
  const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  u.searchParams.set("apikey", key);
  u.searchParams.set("latlong", `${at.lat.toFixed(4)},${at.lng.toFixed(4)}`);
  u.searchParams.set("radius", String(TM_RADIUS_KM));
  u.searchParams.set("unit", "km");
  u.searchParams.set("startDateTime", `${from}T00:00:00Z`);
  u.searchParams.set("endDateTime", `${to}T23:59:59Z`);
  u.searchParams.set("sort", "date,asc");
  u.searchParams.set("size", "40");
  return u.toString();
}

type TmVenue = { name?: string; city?: { name?: string }; address?: { line1?: string }; location?: { latitude?: string; longitude?: string } };
type TmEvent = {
  id?: string; name?: string; url?: string;
  dates?: { start?: { localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  images?: { url?: string; width?: number; ratio?: string }[];
  _embedded?: { venues?: TmVenue[] };
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
function clock(t: string | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Ticketmaster's answer as Find results: one per show, dated, at its venue, linking to buy. */
export function parseTicketmaster(json: unknown, max = 12): FindResult[] {
  const events = ((json as { _embedded?: { events?: TmEvent[] } } | null)?._embedded?.events ?? []);
  const seen = new Set<string>();
  const out: FindResult[] = [];
  for (const e of events) {
    const v = e._embedded?.venues?.[0];
    const lat = Number(v?.location?.latitude), lng = Number(v?.location?.longitude);
    const date = e.dates?.start?.localDate;
    if (!e.id || !e.name || !v?.name || !date || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // A run of nights is one show: the first night stands for it.
    const k = e.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const c = e.classifications?.[0];
    const kind = c?.genre?.name && c.genre.name !== "Undefined" ? c.genre.name : c?.segment?.name ?? "Show";
    const time = clock(e.dates?.start?.localTime);
    const img = (e.images ?? []).filter((i) => i.url && i.ratio === "16_9").sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url ?? e.images?.[0]?.url ?? null;
    out.push({
      placeId: `tm:${e.id}`,
      name: v.name,
      title: e.name,
      address: [v.address?.line1, v.city?.name].filter(Boolean).join(", "),
      lat, lng,
      rating: null, reviews: null,
      why: `${dayLabel(date)}: ${kind}${time ? `, ${time}` : ""}.`,
      source: e.url ? { name: "Ticketmaster", url: e.url } : null,
      from: "google",
      kids: c?.segment?.name === "Family",
      photo: img,
    });
    if (out.length >= max) break;
  }
  return out;
}
