import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { googleQuery, travellersPrompt, parseTravellers, cacheKey, CACHE_DAYS, DATED, onTripDates, fixWeekdays } from "@/lib/find/ask";
import { NEAR_PLAN, withinWalk } from "@/lib/find/near";
import { mergeFind, fitsCategory, isBeach, isTour, FAR_KM, EVENT_FAR_KM, type FindResult } from "@/lib/find/merge";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Find: places for one of a journey's gaps (29 Sep 2026) ────────────────
//
// Two sources, in parallel. Travellers: Claude, with web search, reads
// Reddit threads and travel blogs for the base and the category and names
// the places people who went recommend, each with a reason and the page it
// came from; every name is then checked on Google (a name Google cannot
// find near the base never reaches the person). Google: well-rated places
// near the base for the same category. lib/find/merge puts them together.
// Nothing is saved here; the sheet's Save does that.
//
// Two calls, not one (Rome test, 29 Sep 2026: 20-50 s a search). The sheet
// asks mode "google" (about a second) and mode "travellers" (Claude, 20-40 s)
// side by side and shows Google's while the travellers are read. Each answer
// is kept in public.find_cache for CACHE_DAYS, shared by everyone: places are
// public, and what is already on THIS journey is filtered per request. The
// cache is service-role only (lib/supabase/admin) so no one can write into
// another person's results. Only a travellers call that misses the cache
// counts against the daily allowance.

// Web searches and Claude writing: 60 s cut Tuscany's event search off (30 Sep 2026).
export const maxDuration = 180;

type GPlace = { place_id: string; name: string; formatted_address?: string; vicinity?: string; geometry?: { location?: { lat: number; lng: number } }; rating?: number; user_ratings_total?: number; types?: string[]; photos?: { photo_reference?: string }[] };

const KIDS_TYPES = ["amusement_park", "zoo", "aquarium", "park", "museum", "tourist_attraction"];

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { tripId?: string; base?: { label?: string; lat?: number; lng?: number }; subType?: string; ask?: string | null; mode?: string; near?: { lat?: number; lng?: number }[]; nearNames?: string[] } | null;
  const tripId = body?.tripId, base = body?.base, subType = body?.subType ?? "self_directed";
  const mode: "google" | "travellers" = body?.mode === "travellers" ? "travellers" : "google";
  if (!tripId || !base?.label || typeof base.lat !== "number" || typeof base.lng !== "number") {
    return NextResponse.json({ error: "tripId and base are required" }, { status: 400 });
  }
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!googleKey) return NextResponse.json({ error: "Google isn't configured" }, { status: 500 });

  // RLS: the trip is readable only by its members.
  const { data: trip } = await gate.supabase.from("trips").select("id, destination, start_date, end_date, party_size, party_ages").eq("id", tripId).maybeSingle();
  if (!trip) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  const [{ data: people }, { data: onTrip }] = await Promise.all([
    gate.supabase.from("people").select("birthdate").eq("trip_id", tripId),
    gate.supabase.from("cards").select("place:places(google_place_id, title, lat, lng)").eq("trip_id", tripId).not("archived", "is", true),
  ]);
  const start = Date.parse(trip.start_date + "T12:00:00Z");
  const ages = [
    ...(((trip.party_ages as number[] | null) ?? [])),
    ...((people ?? []).map((p) => (p.birthdate ? Math.floor((start - Date.parse(p.birthdate + "T12:00:00Z")) / (365.25 * 86_400_000)) : null)).filter((a): a is number => a != null)),
  ];
  const childAges = ages.filter((a) => a < 13);
  // Children with no ages saved: a party of three or more might have them, as
  // Plan my trip assumes (lib/plan/draftRows hasChildren). Japan has no ages,
  // and its events came back with the Kanamara Matsuri (30 Sep 2026).
  const kids = childAges.length > 0 || (ages.length === 0 && (trip.party_size ?? 0) >= 3);
  const tripPlaces = ((onTrip ?? []) as unknown as { place: { google_place_id: string | null; title: string; lat: number | null; lng: number | null } | null }[]).map((c) => c.place).filter((p): p is NonNullable<typeof p> => !!p);
  const already = new Set(tripPlaces.map((p) => p.google_place_id).filter((x): x is string => !!x));
  const known = tripPlaces.filter((p) => p.lat != null && p.lng != null).map((p) => ({ name: p.title, lat: p.lat!, lng: p.lng! }));
  const country = (trip.destination ?? "").split(",").pop()?.trim() || null;
  const month = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const ask = typeof body?.ask === "string" ? body.ask.slice(0, 120) : null;
  // Events, races and camps happen on dates: no Google (it can only name
  // venues), and the travellers' search is for what is on while you are there.
  const dated = DATED.has(subType) && !ask;
  if (dated && mode === "google") return NextResponse.json({ results: [], mode });
  // Events reach a day trip away (lib/find/merge EVENT_FAR_KM).
  const farKm = dated && subType === "event" ? EVENT_FAR_KM : FAR_KM;
  // Coffee and dessert near the day's sights, when the base has some (lib/find/near).
  const near = NEAR_PLAN.has(subType) && !ask
    ? (body?.near ?? []).filter((p): p is { lat: number; lng: number } => typeof p?.lat === "number" && typeof p?.lng === "number").slice(0, 4)
    : [];
  const nearNames = near.length ? (body?.nearNames ?? []).filter((n) => typeof n === "string").slice(0, 6).map((n) => n.slice(0, 60)) : [];
  const key = cacheKey({ mode, lat: base.lat, lng: base.lng, subType, ask, kids, near, when: dated ? `${trip.start_date}|${trip.end_date}|region2` : null });
  const answer = (found: FindResult[]) => NextResponse.json({
    results: withinWalk(mode === "travellers" ? mergeFind({ lat: base.lat!, lng: base.lng! }, found, [], already, known, farKm) : mergeFind({ lat: base.lat!, lng: base.lng! }, [], found, already, known, farKm), near),
    mode,
  });

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }
  if (admin) {
    const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
    const { data: hit } = await admin.from("find_cache").select("results").eq("key", key).gte("created_at", since).maybeSingle();
    if (hit) return answer(hit.results as FindResult[]);
  }
  if (mode === "travellers" && !(await underQuota(gate.supabase, "find", QUOTA.find))) return quotaExceeded("finds");
  if (mode === "google" && !(await underQuota(gate.supabase, "findGoogle", QUOTA.findGoogle))) return quotaExceeded("finds");

  const findOnGoogle = async (input: string): Promise<GPlace | null> => {
    const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    u.searchParams.set("input", input);
    u.searchParams.set("inputtype", "textquery");
    u.searchParams.set("fields", "place_id,name,formatted_address,geometry,rating,user_ratings_total,types,photos");
    u.searchParams.set("locationbias", `circle:40000@${base.lat},${base.lng}`);
    u.searchParams.set("key", googleKey);
    const j = await fetch(u.toString()).then((r) => r.json()).catch(() => null) as { candidates?: GPlace[] } | null;
    return j?.candidates?.[0] ?? null;
  };
  const toResult = (g: GPlace, from: FindResult["from"], why: string, source: FindResult["source"], kids: boolean): FindResult | null => {
    const loc = g.geometry?.location;
    if (!loc) return null;
    if (!fitsCategory(subType, g.types)) return null;
    // Google's beaches must be beaches (lib/find/merge isBeach).
    if (from === "google" && subType === "beach" && !isBeach(g.name, g.types)) return null;
    // and its tours are tours, not a TV station or a bus company (isTour).
    if (from === "google" && subType === "guided" && !isTour(g.name, g.types)) return null;
    return { placeId: g.place_id, name: g.name, address: g.formatted_address ?? g.vicinity ?? "", lat: loc.lat, lng: loc.lng, rating: g.rating ?? null, reviews: g.user_ratings_total ?? null, why, source, from, kids, photoRef: g.photos?.[0]?.photo_reference ?? null };
  };

  const travellers = async (): Promise<FindResult[]> => {
    if (!apiKey) return [];
    try {
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        // Room for the answer after up to five searches: 1500 cut Tuscany's events off mid-reply (30 Sep 2026).
        max_tokens: 8000,
        messages: [{ role: "user", content: travellersPrompt({ base: base.label!, country, subType, ask, party: trip.party_size ?? ages.length ?? 2, childAges, kids, seniors: ages.some((a) => a >= 65), month, from: trip.start_date, to: trip.end_date, near: nearNames }) }],
        // Events search a region's calendars, not one town's: more reading.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: subType === "event" ? 5 : 3 }],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      // Dated kinds keep to the journey's dates (lib/find/ask onTripDates).
      const picks = parseTravellers(text)
        .filter((p) => !dated || onTripDates(p.why, trip.start_date as string, trip.end_date as string))
        // With children, an event the search itself says is not for them is left out (Kanamara Matsuri, Tokyo).
        .filter((p) => !dated || !kids || p.kids)
        .map((p) => (dated ? { ...p, why: fixWeekdays(p.why, trip.start_date as string, trip.end_date as string) } : p));
      // What the search named, and what Google could place: an empty list is otherwise silent.
      console.log("[find] travellers", subType, base.label, "named", picks.length, picks.map((p) => p.name).join(" / ").slice(0, 400), picks.length ? "" : `stop=${res.stop_reason} text=${text.slice(-300)}`);
      const checked = await Promise.all(picks.map(async (p) => {
        const g = await findOnGoogle(`${p.name}, ${p.near ?? base.label}`);
        return g ? toResult(g, "travellers", p.why, p.sourceUrl ? { name: p.sourceName ?? new URL(p.sourceUrl).hostname, url: p.sourceUrl } : null, kids && p.kids) : null;
      }));
      return checked.filter((x): x is FindResult => x !== null);
    } catch (e) {
      console.error("[find] travellers:", e);
      // Said, not swallowed: an empty answer read as "Nothing new to add here"
      // while the Claude account was out of credit (29 Sep 2026).
      throw e;
    }
  };

  const google = async (): Promise<FindResult[]> => {
    let raw: GPlace[];
    if (near.length) {
      // Around each cluster of the day's sights, a short walk out.
      const seenIds = new Set<string>();
      const lists = await Promise.all(near.map(async (c) => {
        const u = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
        u.searchParams.set("location", `${c.lat},${c.lng}`);
        u.searchParams.set("radius", "1200");
        u.searchParams.set("keyword", subType === "coffee" ? "coffee" : "dessert gelato bakery");
        u.searchParams.set("key", googleKey);
        const j = await fetch(u.toString()).then((r) => r.json()).catch(() => null) as { results?: GPlace[] } | null;
        return (j?.results ?? []).slice(0, 8);
      }));
      raw = lists.flat().filter((g) => !seenIds.has(g.place_id) && seenIds.add(g.place_id));
    } else {
      const u = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      u.searchParams.set("query", googleQuery(subType, base.label!, ask));
      u.searchParams.set("location", `${base.lat},${base.lng}`);
      u.searchParams.set("radius", "15000");
      u.searchParams.set("key", googleKey);
      const j = await fetch(u.toString()).then((r) => r.json()).catch(() => null) as { results?: GPlace[] } | null;
      raw = (j?.results ?? []).slice(0, 20);
    }
    return raw.map((g) => {
      const forKids = kids && (g.types ?? []).some((t) => KIDS_TYPES.includes(t));
      const why = g.rating ? `Rated ${g.rating} on Google from ${(g.user_ratings_total ?? 0).toLocaleString("en-US")} reviews.` : "Well rated on Google.";
      return toResult(g, "google", why, null, forKids);
    }).filter((x): x is FindResult => x !== null);
  };

  let found: FindResult[];
  try {
    found = mode === "travellers" ? await travellers() : await google();
  } catch {
    return NextResponse.json({ error: "Travellers' picks are unavailable just now" }, { status: 502 });
  }
  // Thumbnails (29 Sep 2026: "shouldn't the little squares have pictures?").
  // For every place kept (up to 20 from Google, 8 from travellers): a journey
  // with many places saved sees further down the list, and Rome's Explore
  // showed photos on 5 of 12 when only the top 12 were done. Resolved once
  // here and kept with the answer in the shared cache, so a photo is paid for
  // once per place per month, not on every open. A failed one leaves the tile.
  await Promise.all(found.filter((r) => r.photoRef).map(async (r) => {
    const u = new URL("https://maps.googleapis.com/maps/api/place/photo");
    u.searchParams.set("photoreference", r.photoRef!);
    u.searchParams.set("maxwidth", "240");
    u.searchParams.set("key", googleKey);
    r.photo = await fetch(u.toString(), { redirect: "manual" }).then((x) => x.headers.get("location")).catch(() => null);
  }));
  // An empty answer is not kept: it is more likely a hiccup than the truth.
  if (admin && found.length > 0) await admin.from("find_cache").upsert({ key, results: found, created_at: new Date().toISOString() });
  return answer(found);
}
