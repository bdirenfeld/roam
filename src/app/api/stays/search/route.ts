// POST /api/stays/search { tripId }
// Reads the journey, builds the brief, gathers candidates (the stays already
// saved on the journey, then Google's best-rated lodging near the evening
// centre), asks Google for drive minutes to every anchor, and writes one
// brief and a lettered list of candidates. Rejected candidates from an
// earlier run are kept and never proposed again; "too far" tightens the
// search radius. Nothing here needs a sign-in to any listing site.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { loadTripContext, googleKey, driveMinutes, lodgingNear, placeReviews } from "../_shared";
import { driveHours, driveLine, driveDelta } from "@/lib/stays/drive";
import { areaHeadline, areaLine, splitText, reviewNotes } from "@/lib/stays/text";

const MAX_GOOGLE = 6;
const LETTERS = "ABCDEFGHIJKL";

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "staySearch", QUOTA.staySearch))) return quotaExceeded("stay searches");

  const body = await request.json().catch(() => ({})) as { tripId?: string };
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
  const { data: previous } = await supabase.from("stay_candidates").select("id, name, google_place_id, status, reject_reason").eq("trip_id", trip.id);
  const rejected = (previous ?? []).filter((p) => p.status === "rejected");
  const rejectedNames = new Set(rejected.map((p) => p.name.toLowerCase()));
  const rejectedGoogle = new Set(rejected.map((p) => p.google_place_id).filter(Boolean));
  const tooFar = rejected.some((p) => p.reject_reason === "too_far");
  const radiusM = tooFar ? 9000 : 15000;

  // Candidates: saved stays first, then Google.
  type Cand = {
    name: string; address: string | null; lat: number; lng: number; google_place_id: string | null; place_id: string | null;
    site: string; url: string | null; score: number | null; score_scale: 5 | 10; reviews: number | null; source: "saved" | "google";
  };
  const cands: Cand[] = ctx.savedStays.map((s) => ({
    name: s.title, address: s.address, lat: s.lat, lng: s.lng, google_place_id: s.google_place_id, place_id: s.place_id,
    site: "google", url: s.website, score: s.rating, score_scale: 5, reviews: null, source: "saved",
  }));
  const query = brief.kind === "house" ? `villa with pool near ${centre.label}` : `hotel in ${centre.label}`;
  const hits = await lodgingNear(key, query, centre.lat, centre.lng, radiusM);
  const seen = new Set(cands.map((c) => c.name.toLowerCase()));
  hits
    .filter((h) => !seen.has(h.name.toLowerCase()) && !rejectedNames.has(h.name.toLowerCase()) && !rejectedGoogle.has(h.google_place_id))
    .sort((a, b) => (b.rating ?? 0) * Math.log((b.reviews ?? 1) + 1) - (a.rating ?? 0) * Math.log((a.reviews ?? 1) + 1))
    .slice(0, MAX_GOOGLE)
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

  const weights = anchors.map((a) => a.days);
  const scored = cands.map((c, i) => {
    const mins = matrix[i];
    const hours = driveHours(mins, weights);
    const minutes: Record<string, number | null> = {};
    anchors.forEach((a, j) => { minutes[a.label] = mins[j]; });
    const farthest = anchors
      .map((a, j) => ({ a, m: mins[j] }))
      .filter((x) => x.a.kind === "daytrip" && x.m != null)
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
  const notes = new Map<string, { texts: string[]; website: string | null }>();
  await Promise.all(scored.filter((s) => s.c.google_place_id).slice(0, 8).map(async (s) => {
    notes.set(s.c.google_place_id as string, await placeReviews(key, s.c.google_place_id as string));
  }));

  // Replace the last run's proposals; keep what the person saved, chose or rejected.
  await supabase.from("stay_candidates").delete().eq("trip_id", trip.id).eq("status", "candidate");

  const rows = scored.map((s, i) => {
    const rv = s.c.google_place_id ? notes.get(s.c.google_place_id) : undefined;
    const delta = driveDelta(s.hours, bestHours);
    return {
      trip_id: trip.id,
      user_id: user.id,
      place_id: s.c.place_id,
      google_place_id: s.c.google_place_id,
      letter: LETTERS[i] ?? null,
      name: s.c.name,
      address: s.c.address,
      lat: s.c.lat,
      lng: s.c.lng,
      site: s.c.site,
      url: s.c.url ?? rv?.website ?? null,
      score: s.c.score,
      score_scale: s.c.score_scale,
      reviews: s.c.reviews,
      review_notes: rv ? reviewNotes(rv.texts) : null,
      flags: delta ? [...s.flags, delta] : s.flags,
      drive: { hours: s.hours, line: s.line, minutes: s.minutes },
      status: "candidate",
      source: s.c.source,
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

  const { data: all } = await supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).order("letter");
  return NextResponse.json({ brief: briefRow, candidates: all ?? written });
}
