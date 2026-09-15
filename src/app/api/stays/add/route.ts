// POST /api/stays/add { tripId, base?, url, name?, price? } — a listing he found
// himself joins the list, located by Google Places, driven like the rest, and
// priced at what he saw. DELETE { candidateId } takes it off again (undo).
//
// The search can only compare what Google Hotels hands it; the villa he chose
// for Tuscany came from Vrbo, off-app (15 Sept 2026). See lib/stays/pasted.ts
// for what a page will and will not give a server.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { loadTripContext, googleKey, driveMinutes, placeExtras, freeLetter } from "../_shared";
import { cleanUrl, siteOf, nameFromTitle, parsePastedPrice } from "@/lib/stays/pasted";
import { driveHours, driveLine, driveDelta, usableAnchorIndexes } from "@/lib/stays/drive";
import { reviewNotes } from "@/lib/stays/text";
import { listingName } from "@/lib/stays/listingName";

/** The page's title, best effort: four seconds, then we ask him instead. */
async function pageTitle(url: string): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36", "accept-language": "en" },
    });
    const html = (await res.text()).slice(0, 400000);
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)
      ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
    if (og) return og[1];
    const t2 = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return t2 ? t2[1] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "stayWrite", QUOTA.stayWrite))) return quotaExceeded("stay changes");

  const body = await request.json().catch(() => ({})) as { tripId?: string; base?: number; url?: string; name?: string; price?: string };
  if (!body.tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  const url = cleanUrl(body.url);
  if (!url) return NextResponse.json({ error: "Paste the listing's link." }, { status: 400 });
  const key = googleKey();
  if (!key) return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });

  const ctx = await loadTripContext(supabase, body.tripId, user.id);
  if (!ctx) return NextResponse.json({ error: "Not your journey" }, { status: 403 });
  const { trip, brief } = ctx;
  const baseIndex = Math.max(0, Math.min(Math.max(0, brief.bases.length - 1), Math.trunc(body.base ?? 0)));
  const forBase = brief.bases[baseIndex] ?? null;
  const centre = forBase && baseIndex > 0
    ? { lat: forBase.lat, lng: forBase.lng, label: forBase.label }
    : brief.evening
      ? { lat: brief.evening.lat, lng: brief.evening.lng, label: brief.evening.label }
      : trip.destination_lat != null && trip.destination_lng != null
        ? { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.title }
        : null;
  if (!centre) return NextResponse.json({ error: "Add a few places first so Roam knows where the journey goes." }, { status: 422 });
  const baseNights = forBase?.nights ?? brief.nights;

  // The name: what he typed, else what the page says about itself.
  const fromPage = nameFromTitle(body.name?.trim() ? null : await pageTitle(url));
  const name = body.name?.trim() || fromPage.name;
  if (!name) return NextResponse.json({ error: "The page won't say what it's called — type the name." }, { status: 422 });

  // Where it is: Google Places, looking near this base.
  const find = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  find.searchParams.set("input", fromPage.locality ? `${name}, ${fromPage.locality}` : name);
  find.searchParams.set("inputtype", "textquery");
  find.searchParams.set("fields", "place_id,name,geometry,rating,user_ratings_total,formatted_address");
  find.searchParams.set("locationbias", `circle:60000@${centre.lat},${centre.lng}`);
  find.searchParams.set("key", key);
  const found = await fetch(find.toString(), { next: { revalidate: 0 } })
    .then((r) => r.json() as Promise<{ candidates?: { place_id: string; name?: string; geometry?: { location?: { lat: number; lng: number } }; rating?: number; user_ratings_total?: number; formatted_address?: string }[] }>)
    .then((j) => j.candidates?.[0] ?? null)
    .catch(() => null);
  if (!found?.geometry?.location) {
    return NextResponse.json({ error: `Couldn't place "${name}" near ${centre.label}. Add the town to the name and try again.` }, { status: 422 });
  }
  const lat = found.geometry.location.lat;
  const lng = found.geometry.location.lng;

  // Drives, the same way the search works them out.
  const anchors = brief.anchors;
  const dests = anchors.map((a) => ({ lat: a.lat, lng: a.lng }));
  dests.push({ lat: centre.lat, lng: centre.lng });
  const matrix = await driveMinutes(key, [{ lat, lng }, { lat: centre.lat, lng: centre.lng }], dests);
  const mins = matrix[0];
  const fromCentre = matrix[1];
  const usable = usableAnchorIndexes(anchors, fromCentre);
  const hours = driveHours(usable.map((j) => mins[j]), usable.map((j) => anchors[j].days));
  const minutes: Record<string, number | null> = {};
  anchors.forEach((a, j) => { minutes[a.label] = mins[j]; });
  const eveningIdx = anchors.findIndex((a) => a.kind === "evening");
  const airportIdx = anchors.findIndex((a) => a.kind === "airport");
  const parts = [];
  if (eveningIdx >= 0) parts.push({ label: anchors[eveningIdx].label, minutes: mins[eveningIdx] });
  if (airportIdx >= 0) parts.push({ label: "airport", minutes: mins[airportIdx] });
  // Against the best of what is on the list already, so "adds about 4 hours"
  // means the same thing on this row as on the others.
  const { data: live } = await supabase.from("stay_candidates").select("drive").eq("trip_id", trip.id).eq("base", baseIndex).not("status", "in", "(rejected,seen)");
  const bestHours = Math.min(hours, ...((live ?? []) as { drive: { hours?: number } | null }[]).map((r) => r.drive?.hours ?? Infinity));
  const delta = driveDelta(hours, bestHours);

  const extras = await placeExtras(key, found.place_id);
  const price = parsePastedPrice(body.price, baseNights);
  const letter = await freeLetter(supabase, trip.id, baseIndex, null);

  const row = {
    trip_id: trip.id,
    user_id: user.id,
    base: baseIndex,
    place_id: null,
    google_place_id: found.place_id,
    letter,
    name: listingName(name),
    address: found.formatted_address ?? null,
    lat,
    lng,
    site: siteOf(url),
    url,
    total: price.total,
    currency: price.total != null ? "CAD" : null,
    nightly_cad: price.nightly,
    beds: null, baths: null, sleeps: null, pool: null, ac: null,
    score: found.rating ?? extras.rating ?? null,
    score_scale: 5,
    reviews: found.user_ratings_total ?? extras.reviews ?? null,
    review_notes: reviewNotes(extras.texts),
    flags: delta ? [delta] : [],
    drive: { hours, line: driveLine(parts), minutes },
    status: "candidate",
    // His find. A heart keeps it through every later run and out of every cull.
    feel: "up",
    source: "saved",
    photos: extras.photos,
  };
  const { data: written, error } = await supabase.from("stay_candidates").insert(row).select("*").single();
  if (error || !written) return NextResponse.json({ error: error?.message ?? "Couldn't add it." }, { status: 500 });
  return NextResponse.json({ candidate: written });
}

/** Undo of a paste: the row goes, as long as nothing has been done with it. */
export async function DELETE(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  const body = await request.json().catch(() => ({})) as { candidateId?: string };
  if (!body.candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  const { error } = await supabase.from("stay_candidates").delete().eq("id", body.candidateId).eq("user_id", user.id).eq("status", "candidate");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
