// POST /api/stays/search { tripId }
// Reads the journey, builds the brief, gathers candidates (the stays already
// saved on the journey, then Google's best-rated lodging near the evening
// centre), asks Google for drive minutes to every anchor, and writes one
// brief and a lettered list of candidates. Rejected candidates from an
// earlier run are kept and never proposed again; "too far" tightens the
// search radius. Nothing here needs a sign-in to any listing site.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { loadTripContext, googleKey, driveMinutes, lodgingNear, placeExtras } from "../_shared";
import { driveHours, driveLine, driveDelta, usableAnchorIndexes } from "@/lib/stays/drive";
import { areaHeadline, areaLine, splitText, reviewNotes } from "@/lib/stays/text";

// Five rows, not ten: the stays already saved on the journey come first and
// Google fills what is left ("way too many options" — Brennan, 9 Sept 2026).
const MAX_TOTAL = 5;
const LETTERS = "ABCDEFGHIJKL";

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "staySearch", QUOTA.staySearch))) return quotaExceeded("stay searches");

  const body = await request.json().catch(() => ({})) as { tripId?: string; undo?: { tripId: string; seenIds: string[]; newIds: string[] } };
  // Undo of Run again: the five that were shown come back, the new five go.
  if (body.undo?.tripId) {
    const { data: t } = await supabase.from("trips").select("id, user_id").eq("id", body.undo.tripId).maybeSingle();
    if (!t || t.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });
    if (body.undo.newIds?.length) await supabase.from("stay_candidates").delete().in("id", body.undo.newIds).eq("status", "candidate").is("feel", null);
    if (body.undo.seenIds?.length) await supabase.from("stay_candidates").update({ status: "candidate" }).in("id", body.undo.seenIds).eq("status", "seen");
    const { data: rows } = await supabase.from("stay_candidates").select("*").eq("trip_id", body.undo.tripId).not("status", "in", "(rejected,seen)").order("letter");
    return NextResponse.json({ candidates: rows ?? [] });
  }
  if (!body.tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  const key = googleKey();
  if (!key) return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured" }, { status: 500 });

  const ctx = await loadTripContext(supabase, body.tripId, user.id);
  if (!ctx) return NextResponse.json({ error: "Not your journey" }, { status: 403 });
  const { trip, brief } = ctx;

  // Where to look: the evening centre, else the journey's destination.
  const centre = brief.evening
    ? { lat: brief.evening.lat, lng: brief.evening.lng, label: brief.evening.label }
    : trip.destination_lat != null && trip.destination_lng != null
      ? { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.title }
      : null;
  if (!centre) return NextResponse.json({ error: "Add a few places first so Roam knows where the journey goes." }, { status: 422 });

  // What an earlier run taught us.
  const { data: previous } = await supabase.from("stay_candidates").select("id, name, google_place_id, place_id, status, reject_reason, feel, photos").eq("trip_id", trip.id);
  const rejected = (previous ?? []).filter((p) => p.status === "rejected");
  // Run again brings five FRESH rows (Brennan, 9 Sept 2026): a row shown once and
  // not hearted is "seen" and is not proposed again, same as a rejected one.
  // The rows on the list right now count as seen too: they are about to be
  // marked so, and must not come straight back as "fresh" (found 10 Sept 2026).
  const seenRows = (previous ?? []).filter((p) => p.status === "seen" || (p.status === "candidate" && !p.feel));
  const skipNames = new Set([...rejected, ...seenRows].map((p) => p.name.toLowerCase()));
  const skipGoogle = new Set([...rejected, ...seenRows].map((p) => p.google_place_id).filter(Boolean));
  const skipPlaces = new Set([...rejected, ...seenRows].map((p) => p.place_id).filter(Boolean));
  const tooFar = rejected.some((p) => p.reject_reason === "too_far");
  // "Wrong kind of place" on a villa asks for hotels next time, and the reverse.
  const wrongKind = rejected.filter((p) => p.reject_reason === "wrong_kind");
  // Saved and chosen rows carry their status forward onto the fresh row for the same place.
  // A hearted row is kept like a saved one, and says what to look for next.
  const kept = (previous ?? []).filter((p) => p.status === "saved" || p.status === "chosen" || p.feel === "up");
  const liked = kept.filter((p) => p.feel === "up");
  const keptFor = (c: { place_id: string | null; google_place_id: string | null; name: string }) =>
    kept.find((k) => (c.place_id && k.place_id === c.place_id) || (c.google_place_id && k.google_place_id === c.google_place_id) || k.name.toLowerCase() === c.name.toLowerCase());
  const radiusM = tooFar ? 9000 : 15000;

  // Candidates: saved stays first, then Google.
  type Cand = {
    name: string; address: string | null; lat: number; lng: number; google_place_id: string | null; place_id: string | null;
    site: string; url: string | null; score: number | null; score_scale: 5 | 10; reviews: number | null; source: "saved" | "google";
  };
  const cands: Cand[] = ctx.savedStays
    .filter((s) => {
      const prior = kept.find((k) => k.place_id === s.place_id || k.name.toLowerCase() === s.title.toLowerCase());
      if (prior) return true; // saved / chosen / hearted always come back
      return !skipPlaces.has(s.place_id) && !skipNames.has(s.title.toLowerCase()) && !(s.google_place_id && skipGoogle.has(s.google_place_id));
    })
    .map((s) => ({
    name: s.title, address: s.address, lat: s.lat, lng: s.lng, google_place_id: s.google_place_id, place_id: s.place_id,
    site: "google", url: s.website, score: s.rating, score_scale: 5, reviews: null, source: "saved",
  }));
  // What they hearted steers the words: a liked "Villa …" asks for villas even on a
  // hotel-shaped journey, a liked hotel or resort the other way round.
  const likedNames = liked.map((p) => p.name.toLowerCase()).join(" ");
  const HOUSE_WORDS = /\b(villa|casa|farmhouse|agriturismo|cottage|house)\b/;
  const HOTEL_WORDS = /\b(hotel|resort|inn|ryokan|lodge)\b/;
  const wrongKindNames = wrongKind.map((p) => p.name.toLowerCase()).join(" ");
  const wantHouse = HOUSE_WORDS.test(likedNames) ? true
    : HOTEL_WORDS.test(likedNames) ? false
    : HOUSE_WORDS.test(wrongKindNames) ? false
    : HOTEL_WORDS.test(wrongKindNames) ? true
    : brief.kind === "house";
  const query = wantHouse ? `villa with pool near ${centre.label}` : `hotel in ${centre.label}`;
  const already = new Set(cands.map((c) => c.name.toLowerCase()));
  const fresh = (hs: Awaited<ReturnType<typeof lodgingNear>>) => hs
    .filter((h) => !already.has(h.name.toLowerCase()) && !skipNames.has(h.name.toLowerCase()) && !skipGoogle.has(h.google_place_id))
    .filter((h) => !cands.some((c) => c.google_place_id === h.google_place_id));
  let pool = fresh(await lodgingNear(key, query, centre.lat, centre.lng, radiusM));
  if (pool.length < MAX_TOTAL - cands.length) {
    // The first twenty are used up; ask differently and a little wider.
    const alt = wantHouse ? `agriturismo or farmhouse with pool near ${centre.label}` : `boutique hotel near ${centre.label}`;
    const more = fresh(await lodgingNear(key, alt, centre.lat, centre.lng, Math.round(radiusM * 1.6)));
    const ids = new Set(pool.map((h) => h.google_place_id));
    pool = pool.concat(more.filter((h) => !ids.has(h.google_place_id)));
  }
  pool
    .sort((a, b) => (b.rating ?? 0) * Math.log((b.reviews ?? 1) + 1) - (a.rating ?? 0) * Math.log((a.reviews ?? 1) + 1))
    .slice(0, Math.max(0, MAX_TOTAL - cands.length))
    .forEach((h) => cands.push({
      name: h.name, address: h.address, lat: h.lat, lng: h.lng, google_place_id: h.google_place_id, place_id: null,
      site: "google", url: null, score: h.rating, score_scale: 5, reviews: h.reviews, source: "google",
    }));

  if (!cands.length) return NextResponse.json({ error: "Nothing found near " + centre.label }, { status: 404 });

  // Drive minutes: candidates → anchors, plus the evening centre → anchors for the split sentence.
  const anchors = brief.anchors;
  const origins = cands.map((c) => ({ lat: c.lat, lng: c.lng }));
  origins.push({ lat: centre.lat, lng: centre.lng });
  const matrix = await driveMinutes(key, origins, anchors.map((a) => ({ lat: a.lat, lng: a.lng })));
  const fromCentre = matrix[cands.length];
  const centreMinutes: Record<string, number | null> = {};
  anchors.forEach((a, j) => { centreMinutes[a.label] = fromCentre[j]; });
  const airportIdx = anchors.findIndex((a) => a.kind === "airport");
  const eveningIdx = anchors.findIndex((a) => a.kind === "evening");

  // A cluster hours away from the evening centre (Tokyo → Kagoshima) is a
  // second base, not a day trip: it stays out of the hours and the line, and
  // the split sentence below is where it gets named.
  const usable = usableAnchorIndexes(anchors, fromCentre);
  const weights = anchors.map((a) => a.days);
  const scored = cands.map((c, i) => {
    const mins = matrix[i];
    const hours = driveHours(usable.map((j) => mins[j]), usable.map((j) => weights[j]));
    const minutes: Record<string, number | null> = {};
    anchors.forEach((a, j) => { minutes[a.label] = mins[j]; });
    const farthest = anchors
      .map((a, j) => ({ a, m: mins[j], j }))
      .filter((x) => x.a.kind === "daytrip" && x.m != null && usable.includes(x.j))
      .sort((x, y) => (y.m as number) - (x.m as number))[0];
    const parts = [];
    if (eveningIdx >= 0) parts.push({ label: anchors[eveningIdx].label, minutes: mins[eveningIdx] });
    if (airportIdx >= 0) parts.push({ label: "airport", minutes: mins[airportIdx] });
    if (farthest) parts.push({ label: farthest.a.label, minutes: farthest.m });
    const flags: string[] = [];
    if (eveningIdx >= 0 && mins[eveningIdx] != null && (mins[eveningIdx] as number) > brief.radiusMin) flags.push("Outside the area");
    return { c, hours, minutes, line: driveLine(parts), flags };
  });
  const bestHours = Math.min(...scored.map((s) => s.hours));
  scored.sort((a, b) => a.hours - b.hours || (b.c.score ?? 0) - (a.c.score ?? 0));

  // Reviews for the Google ones (an Atmosphere-tier call each, capped by MAX_GOOGLE).
  const notes = new Map<string, { texts: string[]; website: string | null; photos: string[]; rating: number | null; reviews: number | null }>();
  await Promise.all(scored.filter((s) => s.c.google_place_id).slice(0, 8).map(async (s) => {
    notes.set(s.c.google_place_id as string, await placeExtras(key, s.c.google_place_id as string));
  }));

  // Replace the last run's rows. Rejected ones stay, so they are never proposed
  // again; saved and chosen come back as fresh rows with their status kept.
  const { data: nowSeen } = await supabase.from("stay_candidates").update({ status: "seen" }).eq("trip_id", trip.id).eq("status", "candidate").is("feel", null).select("id");
  await supabase.from("stay_candidates").delete().eq("trip_id", trip.id).or("status.in.(saved,chosen),feel.eq.up");

  const rows = scored.map((s, i) => {
    const rv = s.c.google_place_id ? notes.get(s.c.google_place_id) : undefined;
    const delta = driveDelta(s.hours, bestHours);
    const prior = keptFor(s.c);
    return {
      trip_id: trip.id,
      user_id: user.id,
      place_id: s.c.place_id ?? prior?.place_id ?? null,
      google_place_id: s.c.google_place_id,
      letter: LETTERS[i] ?? null,
      name: s.c.name,
      address: s.c.address,
      lat: s.c.lat,
      lng: s.c.lng,
      site: s.c.site,
      url: s.c.url ?? rv?.website ?? null,
      score: s.c.score ?? rv?.rating ?? null,
      score_scale: s.c.score_scale,
      reviews: s.c.reviews ?? rv?.reviews ?? null,
      review_notes: rv ? reviewNotes(rv.texts) : null,
      flags: delta ? [...s.flags, delta] : s.flags,
      drive: { hours: s.hours, line: s.line, minutes: s.minutes },
      status: prior?.status ?? "candidate",
      source: s.c.source,
      feel: prior?.feel ?? null,
      photos: rv?.photos?.length ? rv.photos : (prior?.photos ?? []),
    };
  });
  const { data: written, error } = await supabase.from("stay_candidates").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const airportMin = airportIdx >= 0 ? fromCentre[airportIdx] : null;
  const headline = areaHeadline(brief);
  const line = areaLine(brief, airportMin);
  const briefRow = {
    trip_id: trip.id,
    user_id: user.id,
    ran_at: new Date().toISOString(),
    brief: JSON.parse(JSON.stringify(brief)),
    area_text: [headline, line].filter(Boolean).join(" ") || null,
    split_text: splitText(brief, centreMinutes),
  };
  const { error: briefErr } = await supabase.from("stay_briefs").upsert(briefRow, { onConflict: "trip_id" });
  if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });

  const { data: all } = await supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).not("status", "in", "(rejected,seen)").order("letter");
  const newIds = ((written ?? []) as { id: string; status: string; feel: string | null }[]).filter((r) => r.status === "candidate" && !r.feel).map((r) => r.id);
  return NextResponse.json({ brief: briefRow, candidates: all ?? written, undo: { tripId: trip.id, seenIds: (nowSeen ?? []).map((r) => r.id), newIds } });
}
