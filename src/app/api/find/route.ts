import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { googleQuery, travellersPrompt, parseTravellers, cacheKey, CACHE_DAYS } from "@/lib/find/ask";
import { mergeFind, fitsCategory, type FindResult } from "@/lib/find/merge";
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

export const maxDuration = 60;

type GPlace = { place_id: string; name: string; formatted_address?: string; geometry?: { location?: { lat: number; lng: number } }; rating?: number; user_ratings_total?: number; types?: string[] };

const KIDS_TYPES = ["amusement_park", "zoo", "aquarium", "park", "museum", "tourist_attraction"];

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { tripId?: string; base?: { label?: string; lat?: number; lng?: number }; subType?: string; ask?: string | null; mode?: string } | null;
  const tripId = body?.tripId, base = body?.base, subType = body?.subType ?? "self_directed";
  const mode: "google" | "travellers" = body?.mode === "travellers" ? "travellers" : "google";
  if (!tripId || !base?.label || typeof base.lat !== "number" || typeof base.lng !== "number") {
    return NextResponse.json({ error: "tripId and base are required" }, { status: 400 });
  }
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!googleKey) return NextResponse.json({ error: "Google isn't configured" }, { status: 500 });

  // RLS: the trip is readable only by its members.
  const { data: trip } = await gate.supabase.from("trips").select("id, destination, start_date, party_size, party_ages").eq("id", tripId).maybeSingle();
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
  const tripPlaces = ((onTrip ?? []) as unknown as { place: { google_place_id: string | null; title: string; lat: number | null; lng: number | null } | null }[]).map((c) => c.place).filter((p): p is NonNullable<typeof p> => !!p);
  const already = new Set(tripPlaces.map((p) => p.google_place_id).filter((x): x is string => !!x));
  const known = tripPlaces.filter((p) => p.lat != null && p.lng != null).map((p) => ({ name: p.title, lat: p.lat!, lng: p.lng! }));
  const country = (trip.destination ?? "").split(",").pop()?.trim() || null;
  const month = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const ask = typeof body?.ask === "string" ? body.ask.slice(0, 120) : null;
  const key = cacheKey({ mode, lat: base.lat, lng: base.lng, subType, ask, kids: childAges.length > 0 });
  const answer = (found: FindResult[]) => NextResponse.json({
    results: mode === "travellers" ? mergeFind({ lat: base.lat!, lng: base.lng! }, found, [], already, known) : mergeFind({ lat: base.lat!, lng: base.lng! }, [], found, already, known),
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
    u.searchParams.set("fields", "place_id,name,formatted_address,geometry,rating,user_ratings_total,types");
    u.searchParams.set("locationbias", `circle:40000@${base.lat},${base.lng}`);
    u.searchParams.set("key", googleKey);
    const j = await fetch(u.toString()).then((r) => r.json()).catch(() => null) as { candidates?: GPlace[] } | null;
    return j?.candidates?.[0] ?? null;
  };
  const toResult = (g: GPlace, from: FindResult["from"], why: string, source: FindResult["source"], kids: boolean): FindResult | null => {
    const loc = g.geometry?.location;
    if (!loc) return null;
    if (!fitsCategory(subType, g.types)) return null;
    return { placeId: g.place_id, name: g.name, address: g.formatted_address ?? "", lat: loc.lat, lng: loc.lng, rating: g.rating ?? null, reviews: g.user_ratings_total ?? null, why, source, from, kids };
  };

  const travellers = async (): Promise<FindResult[]> => {
    if (!apiKey) return [];
    try {
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: travellersPrompt({ base: base.label!, country, subType, ask, party: trip.party_size ?? ages.length ?? 2, childAges, month }) }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      const picks = parseTravellers(text);
      const checked = await Promise.all(picks.map(async (p) => {
        const g = await findOnGoogle(`${p.name}, ${p.near ?? base.label}`);
        return g ? toResult(g, "travellers", p.why, p.sourceUrl ? { name: p.sourceName ?? new URL(p.sourceUrl).hostname, url: p.sourceUrl } : null, childAges.length > 0 && p.kids) : null;
      }));
      return checked.filter((x): x is FindResult => x !== null);
    } catch (e) {
      console.error("[find] travellers:", e);
      return [];
    }
  };

  const google = async (): Promise<FindResult[]> => {
    const u = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    u.searchParams.set("query", googleQuery(subType, base.label!, ask));
    u.searchParams.set("location", `${base.lat},${base.lng}`);
    u.searchParams.set("radius", "15000");
    u.searchParams.set("key", googleKey);
    const j = await fetch(u.toString()).then((r) => r.json()).catch(() => null) as { results?: GPlace[] } | null;
    return (j?.results ?? []).slice(0, 20).map((g) => {
      const kids = childAges.length > 0 && (g.types ?? []).some((t) => KIDS_TYPES.includes(t));
      const why = g.rating ? `Rated ${g.rating} on Google from ${(g.user_ratings_total ?? 0).toLocaleString("en-US")} reviews.` : "Well rated on Google.";
      return toResult(g, "google", why, null, kids);
    }).filter((x): x is FindResult => x !== null);
  };

  const found = mode === "travellers" ? await travellers() : await google();
  // An empty answer is not kept: it is more likely a hiccup than the truth.
  if (admin && found.length > 0) await admin.from("find_cache").upsert({ key, results: found, created_at: new Date().toISOString() });
  return answer(found);
}
