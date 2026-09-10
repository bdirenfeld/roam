// POST /api/stays/search { tripId }
// Reads the journey, builds the brief, gathers candidates (the stays already
// saved on the journey, then Google's best-rated lodging near the evening
// centre), asks Google for drive minutes to every anchor, and writes one
// brief and a lettered list of candidates. Rejected candidates from an
// earlier run are kept and never proposed again; "too far" tightens the
// search radius. Nothing here needs a sign-in to any listing site.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { loadTripContext, googleKey, driveMinutes, lodgingNear, placeExtras, serpApiKey, stayOffers } from "../_shared";
import { driveHours, driveLine, driveDelta, usableAnchorIndexes } from "@/lib/stays/drive";
import { areaHeadline, areaLine, splitText, reviewNotes } from "@/lib/stays/text";
import { priceWindow, priceWindowNote } from "@/lib/stays/priceWindow";
import { budgetFlag, budgetVerdict, nightlyOf } from "@/lib/stays/budget";
import { parseAsk, failsAsk, askNote, askBonus } from "@/lib/stays/wants";

// Five rows, not ten: the stays already saved on the journey come first and
// Google fills what is left ("way too many options" — Brennan, 9 Sept 2026).
const MAX_TOTAL = 5;
const LETTERS = "ABCDEFGHIJKL";


export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "staySearch", QUOTA.staySearch))) return quotaExceeded("stay searches");

  const body = await request.json().catch(() => ({})) as { tripId?: string; wants?: string; undo?: { tripId: string; seenIds: string[]; newIds: string[] } };
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
  const { data: previous } = await supabase.from("stay_candidates").select("id, name, address, lat, lng, google_place_id, place_id, status, reject_reason, feel, photos, site, url, score, score_scale, reviews").eq("trip_id", trip.id);
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
    total?: number | null; nightly?: number | null; currency?: string | null;
    beds?: number | null; baths?: number | null; sleeps?: number | null;
    pool?: boolean | null; ac?: boolean | null; photos?: string[];
    /** Google's own amenity list, in memory only: the wants are checked against it. */
    amenities?: string[];
  };
  const inCands = (list: Cand[], name: string, placeId: string | null) =>
    list.some((c) => c.name.toLowerCase() === name.toLowerCase() || (placeId && c.place_id === placeId));

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
  // One free-text line, no form: whatever it names that a listing can answer
  // becomes a must-have, and the whole line steers the words (Brennan, 10 Sept).
  const ask = parseAsk(body.wants);
  const asked = ask.query;
  const query = asked
    ? `${wantHouse ? "villa" : "hotel"} near ${centre.label}, ${asked}`
    : wantHouse ? `villa with pool near ${centre.label}` : `hotel in ${centre.label}`;
  // A row kept from the last run comes back even when it is not one of the
  // journey's saved places — a hearted villa should not vanish because this
  // run's twenty results happen not to include it.
  for (const k of kept) {
    if (k.lat == null || k.lng == null) continue;
    if (inCands(cands, k.name, k.place_id)) continue;
    cands.push({
      name: k.name, address: k.address ?? null, lat: k.lat, lng: k.lng,
      google_place_id: k.google_place_id, place_id: k.place_id,
      site: k.site ?? "google", url: k.url ?? null,
      score: k.score ?? null, score_scale: k.score_scale === 10 ? 10 : 5, reviews: k.reviews ?? null,
      source: "saved", photos: k.photos ?? [],
    });
  }

  // Google Hotels first when the key is there: it is the only source that
  // knows the price for these dates and this party, and the bed count.
  // Nobody quotes a rate for a date that has gone: New York ran 23-26 July and
  // the search came back priceless, which read as a fault. But the shortlist is
  // still worth having — "I'm going to New York, where should I stay" is a real
  // question to ask of a finished journey (Brennan, 10 Sept 2026). So the price
  // window rolls forward whole years until it is in the future, which keeps the
  // season honest (New York in July stays New York in July), and the sheet says
  // which dates the prices are for.
  const priced = priceWindow(trip.start_date, trip.end_date);
  const serp = serpApiKey();
  const ages = (trip.party_ages ?? []).filter((a) => a < 18);
  const adults = Math.max(1, (trip.party_size ?? brief.party.total) - ages.length);
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (serp) {
    const where = ctx.country ? `${centre.label}, ${ctx.country}` : centre.label;
    const offers = await stayOffers(serp, asked ? `${where}, ${asked}` : where, priced.start, priced.end, adults, ages, wantHouse);

    // Everything already on the list is re-priced from THIS run, so a saved or
    // hearted row never shows last month's number (Brennan, 10 Sept 2026).
    // Matched on the name, or on being within about 200 m of it.
    for (const c of cands) {
      const hit = offers.find((o) => norm(o.name) === norm(c.name))
        ?? offers.find((o) => Math.abs(o.lat - c.lat) < 0.002 && Math.abs(o.lng - c.lng) < 0.002);
      if (!hit) continue;
      c.total = hit.total;
      c.nightly = hit.nightly;
      c.currency = hit.currency;
      c.beds = hit.beds ?? c.beds;
      c.baths = hit.baths ?? c.baths;
      c.sleeps = hit.sleeps ?? c.sleeps;
      c.pool = hit.pool ?? c.pool;
      c.ac = hit.ac ?? c.ac;
      c.score = hit.score ?? c.score;
      c.reviews = hit.reviews ?? c.reviews;
      c.url = c.url ?? hit.url;
      if (hit.site && hit.site !== "google") c.site = hit.site;
      if (hit.photos.length) c.photos = hit.photos;
    }

    offers
      .filter((o) => (o.score ?? 0) >= 4.3 && (o.reviews ?? 0) >= 20)
      // Twice what the Estimate budgets a night is not a near miss, it is a
      // wasted row (Brennan, 10 Sept 2026). A journey with no Estimate has no
      // ceiling and nothing is dropped.
      .filter((o) => budgetVerdict(nightlyOf(o.nightly, o.total, brief.nights), ctx.nightlyRate) !== "far")
      // A must-have removes a row only when the listing says it is absent.
      // "Not listed" is a third state and keeps its place — treating it as a
      // failure would empty a list like Tuscany's, where no row has amenities.
      .filter((o) => !failsAsk(ask, o.amenities))
      .filter((o) => !skipNames.has(o.name.toLowerCase()))
      .filter((o) => !cands.some((c) => c.name.toLowerCase() === o.name.toLowerCase()))
      .filter((o) => !brief.fit.bedrooms || o.beds == null || o.beds >= brief.fit.bedrooms - 1)
      .sort((a, b) => (b.score ?? 0) * Math.log((b.reviews ?? 1) + 1) - (a.score ?? 0) * Math.log((a.reviews ?? 1) + 1))
      .slice(0, Math.max(0, MAX_TOTAL - cands.length))
      .forEach((o) => cands.push({
        name: o.name, address: null, lat: o.lat, lng: o.lng, google_place_id: null, place_id: null,
        site: o.site, url: o.url, score: o.score, score_scale: 5, reviews: o.reviews, source: "google",
        total: o.total, nightly: o.nightly, currency: o.currency, amenities: o.amenities,
        beds: o.beds, baths: o.baths, sleeps: o.sleeps, pool: o.pool, ac: o.ac, photos: o.photos,
      }));
  }

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

  // A row Google's map turned up carries no price, and the area search only
  // finds it if it happened to be in the twenty that came back. Saying "no
  // price on a booking site" about La Serena Villas — which plainly is on
  // booking sites — is a claim about the property rather than about our
  // search (Brennan, 10 Sept 2026). So ask for each unpriced one by name
  // before giving up. Capped at three: each is its own request.
  if (serp) {
    const stillBlank = cands.filter((c) => c.total == null).slice(0, 3);
    await Promise.all(stillBlank.map(async (c) => {
      const q = [c.name, centre.label, ctx.country].filter(Boolean).join(", ");
      const found = await stayOffers(serp, q, priced.start, priced.end, adults, ages, wantHouse);
      // Only a real match: the same name, or the same spot within about 200 m.
      const hit = found.find((o) => norm(o.name) === norm(c.name))
        ?? found.find((o) => Math.abs(o.lat - c.lat) < 0.002 && Math.abs(o.lng - c.lng) < 0.002);
      if (!hit || hit.total == null) return;
      c.total = hit.total;
      c.nightly = hit.nightly;
      c.currency = hit.currency;
      c.beds = hit.beds ?? c.beds;
      c.baths = hit.baths ?? c.baths;
      c.sleeps = hit.sleeps ?? c.sleeps;
      c.amenities = hit.amenities?.length ? hit.amenities : c.amenities;
      c.url = c.url ?? hit.url;
      if (hit.site && hit.site !== "google") c.site = hit.site;
      if (!c.photos?.length && hit.photos.length) c.photos = hit.photos;
    }));
  }

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
    const over = budgetFlag(nightlyOf(c.nightly ?? null, c.total ?? null, brief.nights), ctx.nightlyRate);
    if (over) flags.push(over);
    // What he asked for: a nice-to-have that turned up is worth saying, and
    // anything we could not verify says so rather than leaving a blank.
    const bonus = askBonus(ask, c.amenities);
    if (bonus) flags.push(bonus);
    const unverified = askNote(ask, c.amenities);
    if (unverified) flags.push(unverified);
    return { c, hours, minutes, line: driveLine(parts), flags };
  });
  const bestHours = Math.min(...scored.map((s) => s.hours));
  scored.sort((a, b) => a.hours - b.hours || (b.c.score ?? 0) - (a.c.score ?? 0));

  // Reviews for the Google ones (an Atmosphere-tier call each, capped by MAX_GOOGLE).
  const notes = new Map<string, { texts: string[]; website: string | null; photos: string[]; rating: number | null; reviews: number | null }>();
  await Promise.all(scored.filter((s) => s.c.google_place_id && !s.c.photos?.length).slice(0, 8).map(async (s) => {
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
      total: s.c.total ?? null,
      currency: s.c.currency ?? null,
      nightly_cad: s.c.nightly ?? null,
      beds: s.c.beds ?? null,
      baths: s.c.baths ?? null,
      sleeps: s.c.sleeps ?? null,
      pool: s.c.pool ?? null,
      ac: s.c.ac ?? null,
      score: s.c.score ?? rv?.rating ?? null,
      score_scale: s.c.score_scale,
      reviews: s.c.reviews ?? rv?.reviews ?? null,
      review_notes: rv ? reviewNotes(rv.texts) : null,
      flags: delta ? [...s.flags, delta] : s.flags,
      drive: { hours: s.hours, line: s.line, minutes: s.minutes },
      status: prior?.status ?? "candidate",
      source: s.c.source,
      feel: prior?.feel ?? null,
      photos: s.c.photos?.length ? s.c.photos : rv?.photos?.length ? rv.photos : (prior?.photos ?? []),
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
    brief: { ...JSON.parse(JSON.stringify(brief)), wants: asked || null },
    area_text: [headline, line, priceWindowNote(priced, trip.start_date)].filter(Boolean).join(" ") || null,
    price_year: priced.shifted ? Number(priced.start.slice(0, 4)) : null,
    split_text: splitText(brief, centreMinutes),
  };
  const { error: briefErr } = await supabase.from("stay_briefs").upsert(briefRow, { onConflict: "trip_id" });
  if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });

  const { data: all } = await supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).not("status", "in", "(rejected,seen)").order("letter");
  const newIds = ((written ?? []) as { id: string; status: string; feel: string | null }[]).filter((r) => r.status === "candidate" && !r.feel).map((r) => r.id);
  return NextResponse.json({ brief: briefRow, candidates: all ?? written, undo: { tripId: trip.id, seenIds: (nowSeen ?? []).map((r) => r.id), newIds } });
}
