// ── Where to stay: the server-side pieces the four routes share ───────────
// Not under src/lib on purpose: everything here talks to Supabase or Google,
// so it cannot be unit-tested and would only be grandfathered. The pure
// decisions it feeds live in src/lib/stays and are tested there.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StayCandidate } from "@/types/database";
import { buildStayBrief, countryOfPins, type BriefPin, type StayBrief } from "@/lib/stays/brief";

export interface TripContext {
  trip: {
    id: string; user_id: string; title: string; start_date: string; end_date: string;
    party_ages: number[] | null; party_size: number | null;
    destination_lat: number | null; destination_lng: number | null;
    accommodation_name: string | null; accommodation_address: string | null;
  };
  days: { id: string; date: string; day_number: number }[];
  brief: StayBrief;
  /** Where the journey is, from its own pins — "Italy", "USA", "Japan". */
  country: string | null;
  /** Stay-type places already saved on this journey, once each. */
  savedStays: { place_id: string; title: string; address: string | null; lat: number; lng: number; google_place_id: string | null; rating: number | null; website: string | null }[];
}

/** The journey, its days, its pins and the brief built from them. Null when the caller does not own it. */
export async function loadTripContext(supabase: SupabaseClient, tripId: string, userId: string): Promise<TripContext | null> {
  const [{ data: trip }, { data: days }, { data: cards }] = await Promise.all([
    supabase.from("trips").select("id, user_id, title, start_date, end_date, party_ages, party_size, destination_lat, destination_lng, accommodation_name, accommodation_address").eq("id", tripId).maybeSingle(),
    supabase.from("days").select("id, date, day_number").eq("trip_id", tripId).order("day_number"),
    supabase.from("cards").select("day_id, start_time, status, place:places (id, title, address, lat, lng, sub_type, google_place_id, rating, website)").eq("trip_id", tripId).neq("status", "cut"),
  ]);
  if (!trip || trip.user_id !== userId) return null;

  const dayDate = new Map<string, string>();
  for (const d of days ?? []) dayDate.set(d.id, d.date);

  type Row = { day_id: string | null; start_time: string | null; status: string; place: { id: string; title: string; address: string | null; lat: number | null; lng: number | null; sub_type: string | null; google_place_id: string | null; rating: number | null; website: string | null } | null };
  const rows = (cards ?? []) as unknown as Row[];

  const pins: BriefPin[] = [];
  const savedStays: TripContext["savedStays"] = [];
  const seenStay = new Set<string>();
  for (const c of rows) {
    const p = c.place;
    if (!p || p.lat == null || p.lng == null) continue;
    pins.push({ title: p.title, address: p.address, lat: p.lat, lng: p.lng, subType: p.sub_type, dayDate: c.day_id ? dayDate.get(c.day_id) ?? null : null, startTime: c.start_time });
    if ((p.sub_type === "hotel" || p.sub_type === "accommodation") && !seenStay.has(p.id)) {
      seenStay.add(p.id);
      savedStays.push({ place_id: p.id, title: p.title, address: p.address, lat: p.lat, lng: p.lng, google_place_id: p.google_place_id, rating: p.rating, website: p.website });
    }
  }

  const brief = buildStayBrief({ startDate: trip.start_date, endDate: trip.end_date, partyAges: trip.party_ages, partySize: trip.party_size, pins });
  return { trip, days: (days ?? []) as TripContext["days"], brief, country: countryOfPins(pins), savedStays };
}

// ── Google ────────────────────────────────────────────────────────────────

export function googleKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY ?? null;
}

/** Driving minutes origins × destinations, null where Google has no road. Chunked to stay under 100 elements. */
export async function driveMinutes(key: string, origins: { lat: number; lng: number }[], dests: { lat: number; lng: number }[]): Promise<(number | null)[][]> {
  const out: (number | null)[][] = origins.map(() => dests.map(() => null));
  if (!origins.length || !dests.length) return out;
  const perChunk = Math.max(1, Math.floor(100 / dests.length));
  for (let i = 0; i < origins.length; i += perChunk) {
    const chunk = origins.slice(i, i + perChunk);
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", chunk.map((o) => `${o.lat},${o.lng}`).join("|"));
    url.searchParams.set("destinations", dests.map((d) => `${d.lat},${d.lng}`).join("|"));
    url.searchParams.set("mode", "driving");
    url.searchParams.set("key", key);
    try {
      const res = await fetch(url.toString(), { next: { revalidate: 0 } });
      const json = await res.json() as { status: string; rows?: { elements: { status: string; duration?: { value: number } }[] }[] };
      if (json.status !== "OK" || !json.rows) continue;
      json.rows.forEach((row, r) => {
        row.elements.forEach((el, c) => {
          out[i + r][c] = el.status === "OK" && el.duration ? Math.round(el.duration.value / 60) : null;
        });
      });
    } catch (err) {
      console.error("[stays] distance matrix failed:", (err as Error).message);
    }
  }
  return out;
}

// ── Google Hotels, through SerpApi ────────────────────────────────────────
// The one source that answers "what does it cost for OUR dates and OUR party",
// and it carries the rest of what the card needs: bedrooms, beds, baths,
// sleeps, amenities and photographs. Google Places has none of that.
//
// A price only exists once the place is bookable: for Lucca, 18 of 18 rentals
// quoted a total for October 2026 and 1 of 18 for August 2027, because hosts
// have not opened those calendars yet (checked 10 Sept 2026). So a missing
// price is the truth about the date, not a failure — the card simply leaves
// the line out.

export interface StayOffer {
  name: string; lat: number; lng: number; url: string | null; site: string;
  total: number | null; nightly: number | null; currency: string;
  score: number | null; reviews: number | null;
  beds: number | null; baths: number | null; sleeps: number | null;
  pool: boolean | null; ac: boolean | null; photos: string[];
}

export function serpApiKey(): string | null {
  return process.env.SERPAPI_KEY ?? null;
}

/** vrbo | airbnb | booking | expedia | direct — from the link Google hands back. */
function siteFromLink(link: string | undefined): string {
  if (!link) return "google";
  const l = link.toLowerCase();
  if (l.includes("vrbo.")) return "vrbo";
  if (l.includes("airbnb.")) return "airbnb";
  if (l.includes("booking.com")) return "booking";
  if (l.includes("expedia.")) return "expedia";
  return "direct";
}

interface SerpProperty {
  name?: string; link?: string; type?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rate_per_night?: { extracted_lowest?: number };
  total_rate?: { extracted_lowest?: number };
  overall_rating?: number; reviews?: number;
  amenities?: string[]; essential_info?: string[];
  images?: { thumbnail?: string; original_image?: string }[];
}

/**
 * Stays near `where` that are actually available for these dates and this
 * party. `wantHouse` asks for vacation rentals rather than hotel rooms.
 */
export async function stayOffers(
  key: string,
  where: string,
  checkIn: string,
  checkOut: string,
  adults: number,
  childrenAges: number[],
  wantHouse: boolean,
): Promise<StayOffer[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_hotels");
  url.searchParams.set("q", where);
  url.searchParams.set("check_in_date", checkIn);
  url.searchParams.set("check_out_date", checkOut);
  url.searchParams.set("adults", String(Math.max(1, adults)));
  if (childrenAges.length) {
    url.searchParams.set("children", String(childrenAges.length));
    url.searchParams.set("children_ages", childrenAges.join(","));
  }
  url.searchParams.set("currency", "CAD");
  // No gl: it is the country the SEARCHER is in, and setting it to Canada
  // pulled Palm Springs results across North America. The country belongs in
  // the query instead (Brennan, 10 Sept 2026).
  url.searchParams.set("hl", "en");
  if (wantHouse) url.searchParams.set("vacation_rentals", "true");
  url.searchParams.set("api_key", key);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const json = await res.json() as { properties?: SerpProperty[]; error?: string };
    if (json.error) { console.error("[stays] serpapi:", json.error); return []; }
    const num = (info: string[] | undefined, re: RegExp): number | null => {
      for (const line of info ?? []) { const m = re.exec(line); if (m) return Number(m[1]); }
      return null;
    };
    return (json.properties ?? [])
      .filter((p) => p.name && p.gps_coordinates?.latitude != null && p.gps_coordinates?.longitude != null)
      .map((p) => {
        const amen = (p.amenities ?? []).join(" | ").toLowerCase();
        return {
          name: p.name as string,
          lat: p.gps_coordinates!.latitude as number,
          lng: p.gps_coordinates!.longitude as number,
          url: p.link ?? null,
          site: siteFromLink(p.link),
          total: p.total_rate?.extracted_lowest ?? null,
          nightly: p.rate_per_night?.extracted_lowest ?? null,
          currency: "CAD",
          score: p.overall_rating != null ? Math.round(p.overall_rating * 100) / 100 : null,
          reviews: p.reviews ?? null,
          beds: num(p.essential_info, /(\d+)\s*bedroom/i),
          baths: num(p.essential_info, /([\d.]+)\s*bathroom/i),
          sleeps: num(p.essential_info, /sleeps\s*(\d+)/i),
          pool: amen ? /pool/.test(amen) : null,
          ac: amen ? /air conditioning/.test(amen) : null,
          photos: (p.images ?? []).map((i) => i.original_image ?? i.thumbnail).filter((u): u is string => !!u).slice(0, 6),
        };
      });
  } catch (err) {
    console.error("[stays] serpapi failed:", (err as Error).message);
    return [];
  }
}

export interface LodgingHit {
  google_place_id: string; name: string; address: string | null; lat: number; lng: number;
  rating: number | null; reviews: number | null;
}

/** Google's lodging near a point for a plain-words query. Rated 4.3+ with 20+ reviews only. */
export async function lodgingNear(key: string, query: string, lat: number, lng: number, radiusM: number): Promise<LodgingHit[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "lodging");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radiusM));
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const json = await res.json() as { status: string; results?: { place_id: string; name: string; formatted_address?: string; geometry?: { location?: { lat: number; lng: number } }; rating?: number; user_ratings_total?: number }[] };
    if (json.status !== "OK" || !json.results) return [];
    return json.results
      .filter((r) => r.geometry?.location && (r.rating ?? 0) >= 4.3 && (r.user_ratings_total ?? 0) >= 20)
      .map((r) => ({
        google_place_id: r.place_id, name: r.name, address: r.formatted_address ?? null,
        lat: r.geometry!.location!.lat, lng: r.geometry!.location!.lng,
        rating: r.rating ?? null, reviews: r.user_ratings_total ?? null,
      }));
  } catch (err) {
    console.error("[stays] lodging search failed:", (err as Error).message);
    return [];
  }
}

/**
 * What Google holds for a place that the sheet needs at once: the review
 * texts (five at most), the website, and the first few photos resolved to
 * URLs. Resolving here, when the search runs, is what makes the card open
 * instantly — done at tap time it was a details call plus eight redirects
 * (Brennan, from his phone, 9 Sept 2026: "takes way too long").
 */
export async function placeExtras(key: string, googlePlaceId: string, photoCount = 4): Promise<{ texts: string[]; website: string | null; photos: string[]; rating: number | null; reviews: number | null }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", googlePlaceId);
  url.searchParams.set("fields", "reviews,website,photos,rating,user_ratings_total");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const json = await res.json() as { result?: { reviews?: { text?: string }[]; website?: string; photos?: { photo_reference?: string }[]; rating?: number; user_ratings_total?: number } };
    const refs = (json.result?.photos ?? []).map((p) => p.photo_reference).filter((r): r is string => !!r).slice(0, photoCount);
    const photos = (await Promise.all(refs.map((r) => photoUrl(key, r)))).filter((u): u is string => !!u);
    return { texts: (json.result?.reviews ?? []).map((r) => r.text ?? "").filter(Boolean), website: json.result?.website ?? null, photos, rating: json.result?.rating ?? null, reviews: json.result?.user_ratings_total ?? null };
  } catch {
    return { texts: [], website: null, photos: [], rating: null, reviews: null };
  }
}

/** The CDN URL behind a Google photo reference (the redirect target), or null. */
async function photoUrl(key: string, ref: string): Promise<string | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.set("photoreference", ref);
  url.searchParams.set("maxwidth", "800");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { redirect: "manual" });
    return res.headers.get("location");
  } catch {
    return null;
  }
}

// ── Places and cards ──────────────────────────────────────────────────────

/**
 * The saved place behind a candidate, created if the candidate came from a
 * search. A Google-sourced candidate dedupes on (user, google_place_id) the
 * way the add sheet does; one with no Google id is inserted as a plain
 * place, which the schema allows.
 */
export async function ensurePlace(supabase: SupabaseClient, userId: string, c: StayCandidate & { google_place_id?: string | null }): Promise<string | null> {
  if (c.place_id) return c.place_id;
  if (c.google_place_id) {
    const { data: existing } = await supabase.from("places").select("id").eq("user_id", userId).eq("google_place_id", c.google_place_id).maybeSingle();
    if (existing) return existing.id;
  }
  const { data: inserted, error } = await supabase
    .from("places")
    .insert({
      user_id: userId,
      google_place_id: c.google_place_id ?? null,
      title: c.name,
      type: "logistics",
      sub_type: "hotel",
      lat: c.lat,
      lng: c.lng,
      address: c.address,
      website: c.url,
      rating: c.score_scale === 5 ? c.score : null,
      details: { stay: { site: c.site, url: c.url, total: c.total, currency: c.currency, beds: c.beds, baths: c.baths, sleeps: c.sleeps, pool: c.pool, ac: c.ac } },
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[stays] place insert failed:", error?.message);
    return null;
  }
  return inserted.id;
}

export async function nextPosition(supabase: SupabaseClient, dayId: string): Promise<number> {
  const { data } = await supabase.from("cards").select("position").eq("day_id", dayId).order("position", { ascending: false }).limit(1);
  return (data?.[0]?.position ?? 0) + 1;
}
