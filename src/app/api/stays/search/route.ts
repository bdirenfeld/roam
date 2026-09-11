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
import { greatCircleKm } from "@/lib/stays/brief";
import { areaHeadline, areaLine, baseArea, splitText, reviewNotes } from "@/lib/stays/text";
import { priceWindow, priceWindowNote } from "@/lib/stays/priceWindow";
import { budgetFlag, budgetVerdict, nightlyOf } from "@/lib/stays/budget";
import { parseAsk, askNote, askBonus } from "@/lib/stays/wants";
import { parseBudget } from "@/lib/stays/budgetInput";
import { inventoriesFor } from "@/lib/stays/inventory";
import { fillOffers } from "@/lib/stays/pickOffers";
import { mapFill, exhaustedNote, repeatNote } from "@/lib/stays/mapFill";

// Five rows, not ten: the stays already saved on the journey come first and
// Google fills what is left ("way too many options" — Brennan, 9 Sept 2026).
const MAX_TOTAL = 5;
const LETTERS = "ABCDEFGHIJKL";
// A home base sits near the evenings. Beyond this it is a different trip.
const MAX_OFFER_KM = 35;


/**
 * DELETE /api/stays/search { tripId } — forget every search for this journey.
 *
 * Brennan, 11 Sept 2026: "you should have a way to clear all the past
 * searches, and then do the search from the beginning, and in theory you
 * should get the same options if you haven't changed your search parameters."
 *
 * He is right, and it is not only tidiness. The search remembers what it has
 * shown: a place seen once is not proposed again, so after five runs around
 * Osaka there was nothing fresh left that anyone prices. Clearing the memory
 * is what makes a second first-run possible.
 *
 * What it clears: every candidate row for the journey, every base, and the
 * brief. What it does NOT touch: places and cards already on the map — those
 * were put there deliberately and are not search history — and the nightly
 * rate on the Estimate, which is the ceiling he typed. The accommodation
 * basis line goes, because the stay it described no longer exists.
 */
export async function DELETE(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;

  const body = await request.json().catch(() => ({})) as { tripId?: string };
  if (!body.tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  const { data: trip } = await supabase.from("trips").select("id, user_id").eq("id", body.tripId).maybeSingle();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });

  const { data: had } = await supabase.from("stay_candidates").select("id, status").eq("trip_id", trip.id);
  const chose = (had ?? []).some((r) => r.status === "chosen");

  const { error } = await supabase.from("stay_candidates").delete().eq("trip_id", trip.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabase.from("stay_briefs").delete().eq("trip_id", trip.id);

  if (chose) {
    // The journey no longer has a stay chosen, so nothing should say it does.
    await supabase.from("trips").update({ accommodation_name: null, accommodation_address: null }).eq("id", trip.id);
    const { data: budget } = await supabase.from("trip_budgets").select("basis").eq("trip_id", trip.id).maybeSingle();
    if (budget) {
      const b = { ...((budget.basis ?? {}) as Record<string, string>) };
      delete b.accommodation;
      await supabase.from("trip_budgets").update({ basis: b, updated_at: new Date().toISOString() }).eq("trip_id", trip.id);
    }
  }

  return NextResponse.json({ cleared: (had ?? []).length, unchose: chose });
}

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "staySearch", QUOTA.staySearch))) return quotaExceeded("stay searches");

  const body = await request.json().catch(() => ({})) as { tripId?: string; wants?: string; budget?: string; base?: number; undo?: { tripId: string; seenIds: string[]; newIds: string[] } };
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

  // The ceiling typed on the search itself wins, and goes back to the Estimate
  // so the two never drift apart. "I don't think people are going to start
  // from the budget menu and realize that the search ties to that" (Brennan,
  // 10 Sept 2026) — so the field shows the Estimate's number and edits it.
  const typed = parseBudget(body.budget, brief.nights);
  if (typed.nightly != null && typed.nightly !== ctx.nightlyRate) {
    ctx.nightlyRate = typed.nightly;
    const { data: bRow } = await supabase.from("trip_budgets").select("assumptions, basis").eq("trip_id", trip.id).maybeSingle();
    const a = (bRow?.assumptions ?? {}) as Record<string, unknown>;
    const b = (bRow?.basis ?? {}) as Record<string, string>;
    await supabase.from("trip_budgets").upsert({
      trip_id: trip.id,
      user_id: user.id,
      assumptions: { ...a, nightlyRate: typed.nightly },
      basis: { ...b, accommodation: "set on the stay search" },
      updated_at: new Date().toISOString(),
    }, { onConflict: "trip_id" });
  }

  // Which base these five are for. A journey that needs two places to sleep
  // gets five for each, and the sheet switches between them rather than
  // stacking ten rows on one map (Brennan, 10 Sept 2026). Base 0 is the
  // evening centre, so a single-base journey is unchanged.
  const baseIndex = Math.max(0, Math.min(brief.bases.length - 1, Math.trunc(body.base ?? 0)));
  const forBase = brief.bases[baseIndex] ?? null;

  // Where to look: this base, else the evening centre, else the destination.
  const centre = forBase && baseIndex > 0
    ? { lat: forBase.lat, lng: forBase.lng, label: forBase.label }
    : brief.evening
      ? { lat: brief.evening.lat, lng: brief.evening.lng, label: brief.evening.label }
      : trip.destination_lat != null && trip.destination_lng != null
        ? { lat: trip.destination_lat, lng: trip.destination_lng, label: trip.title }
        : null;
  // The nights this base is actually booked for, and the dates they fall on.
  // Osaka is five nights at the end of the journey, so pricing it over the
  // whole thirteen would quote a stay nobody is taking. The bases run in
  // order from the start date.
  const baseNights = forBase?.nights ?? brief.nights;
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const nightsBefore = brief.bases.slice(0, baseIndex).reduce((n, b) => n + b.nights, 0);
  const baseStart = addDays(trip.start_date, nightsBefore);
  const baseEnd = addDays(baseStart, baseNights);
  if (!centre) return NextResponse.json({ error: "Add a few places first so Roam knows where the journey goes." }, { status: 422 });

  // What an earlier run taught us.
  const { data: previous } = await supabase.from("stay_candidates").select("id, name, address, lat, lng, google_place_id, place_id, status, reject_reason, feel, photos, site, url, score, score_scale, reviews").eq("trip_id", trip.id).eq("base", baseIndex);
  const rejected = (previous ?? []).filter((p) => p.status === "rejected");
  // Run again brings five FRESH rows (Brennan, 9 Sept 2026): a row shown once and
  // not hearted is "seen" and is not proposed again, same as a rejected one.
  // The rows on the list right now count as seen too: they are about to be
  // marked so, and must not come straight back as "fresh" (found 10 Sept 2026).
  const seenRows = (previous ?? []).filter((p) => p.status === "seen" || (p.status === "candidate" && !p.feel));
  const skipNames = new Set([...rejected, ...seenRows].map((p) => p.name.toLowerCase()));
  const skipGoogle = new Set([...rejected, ...seenRows].map((p) => p.google_place_id).filter(Boolean));
  const skipPlaces = new Set([...rejected, ...seenRows].map((p) => p.place_id).filter(Boolean));
  // "Seen" keeps a place off the NEXT list; "not for us" keeps it off every
  // list. The two were one set, so when the fresh offers ran out there was no
  // way to tell which ones could come back (Osaka, 11 Sept 2026).
  const rejectedNames = new Set(rejected.map((p) => p.name.toLowerCase()));
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

  /**
   * A saved stay belongs to the base it is nearest, not to every base. Japan's
   * saved hotels are spread the length of the country, and without this the
   * Osaka list came back HOSHINOYA Tokyo, Gora Kadan and two Hakone ryokans —
   * they filled all five slots before a single Osaka offer was needed
   * (found on the live site, 10 Sept 2026).
   */
  const nearestBase = (lat: number, lng: number): number => {
    if (brief.bases.length < 2) return 0;
    let best = 0, bestKm = Infinity;
    brief.bases.forEach((b, i) => {
      const km = greatCircleKm(b.lat, b.lng, lat, lng);
      if (km < bestKm) { bestKm = km; best = i; }
    });
    return best;
  };

  const cands: Cand[] = ctx.savedStays
    .filter((s) => nearestBase(s.lat, s.lng) === baseIndex)
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
  const priced = priceWindow(baseStart, baseEnd);
  // How much of this list is news. Both are read after the block, so the
  // sheet can say "nothing new around Osaka" instead of quietly showing rows
  // with no price (11 Sept 2026).
  let repeated = 0;
  let freshOffers = 0;
  const serp = serpApiKey();
  const ages = (trip.party_ages ?? []).filter((a) => a < 18);
  const adults = Math.max(1, (trip.party_size ?? brief.party.total) - ages.length);
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (serp) {
    const where = ctx.country ? `${centre.label}, ${ctx.country}` : centre.label;
    // Hotels and vacation rentals are two separate inventories and a search
    // only ever sees one of them, so on a house-shaped journey a boutique
    // hotel could never come back with a price — which is why La Serena
    // Villas sat on the Palm Springs list saying "no price" (Brennan asked
    // whether we were looking in the wrong place; we were).
    //
    // Probed directly, 10 Sept 2026, Palm Springs for 13–20 Mar 2027:
    //   rentals → 18 properties, 18 priced
    //   hotels  → 18 properties,  1 priced
    //   by name → 0, because `q` is a place, not a property
    // Neither list contains the other. So ask for both and merge, the wanted
    // kind first, deduped on the name.
    const q = asked ? `${where}, ${asked}` : where;
    // Google Hotels refuses a party over six, so on a journey like Tuscany —
    // seven, with both grandparents — the hotel call errors out and returns
    // nothing. Harmless on a villa journey, fatal on a hotel-shaped one where
    // it would be the only search that ran (found 11 Sept 2026).
    const inv = inventoriesFor(adults + ages.length, wantHouse);
    const [rentals, hotels] = await Promise.all([
      inv.rentals ? stayOffers(serp, q, priced.start, priced.end, adults, ages, true) : Promise.resolve([]),
      inv.hotels ? stayOffers(serp, q, priced.start, priced.end, adults, ages, false) : Promise.resolve([]),
    ]);
    const [wanted, other] = inv.prefer === "hotels" ? [hotels, rentals] : [rentals, hotels];
    const seenOffer = new Set(wanted.map((o) => norm(o.name)));
    const offers = [...wanted, ...other.filter((o) => !seenOffer.has(norm(o.name)))];

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

    // Which offers earn a row now lives in lib/stays/pickOffers.ts, where a
    // test can call it. It sat here as a filter chain nothing could reach,
    // which is why "Gallo Cedrone, sleeps 6" landed on a Tuscany list for
    // seven and 228 green tests said nothing (Brennan, 11 Sept 2026).
    const picked = fillOffers(offers, {
      party: brief.party.total,
      fitBedrooms: brief.fit.bedrooms,
      nights: baseNights,
      ceiling: ctx.nightlyRate,
      ask,
      centre: { lat: centre.lat, lng: centre.lng },
      maxKm: MAX_OFFER_KM,
      skipNames,
      rejectedNames,
      taken: new Set(cands.map((c) => c.name.toLowerCase())),
      preferred: seenOffer,
      room: MAX_TOTAL - cands.length,
    });
    repeated = picked.repeated;
    freshOffers = picked.rows.length - picked.repeated;
    picked.rows
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
  // The map fills an EMPTY list, never a thin one. A map row can never carry
  // a price, and padding with them is how the Osaka list ended up with four
  // of five rows unpriced after three runs (Brennan, 11 Sept 2026).
  const fill = mapFill({
    have: cands.length,
    priced: cands.filter((c) => c.total != null).length,
    available: pool.length,
    want: MAX_TOTAL,
  });
  const exhausted = fill.exhausted;
  pool
    .sort((a, b) => (b.rating ?? 0) * Math.log((b.reviews ?? 1) + 1) - (a.rating ?? 0) * Math.log((a.reviews ?? 1) + 1))
    .slice(0, fill.take)
    .forEach((h) => cands.push({
      name: h.name, address: h.address, lat: h.lat, lng: h.lng, google_place_id: h.google_place_id, place_id: null,
      site: "google", url: null, score: h.rating, score_scale: 5, reviews: h.reviews, source: "google",
    }));

  if (!cands.length) return NextResponse.json({ error: "Nothing found near " + centre.label }, { status: 404 });

  // One budget rule, applied after every price is known.
  //
  // The filter on the offers was not enough: the by-name pass above prices a
  // row that never went through it, and on 10 Sept that put "Acme House
  // Company · $51,332 for 7 nights · $7,333 a night" at the top of the Palm
  // Springs list against a $480 ceiling. Anything he saved, chose or hearted
  // is never dropped, whatever it costs.
  for (let i = cands.length - 1; i >= 0; i--) {
    const c = cands[i];
    if (keptFor(c)) continue;
    const nightly = nightlyOf(c.nightly ?? null, c.total ?? null, baseNights);
    if (budgetVerdict(nightly, ctx.nightlyRate) === "far") cands.splice(i, 1);
  }
  if (!cands.length) return NextResponse.json({ error: "Nothing near " + centre.label + " comes in near your Estimate. Raise the nightly rate there and run again." }, { status: 404 });

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
    // "Outside the area" is gone. It was measured against a 15-minute radius
    // nobody set, it fired on nearly every Tuscany row so it separated
    // nothing, and it says vaguely what "Adds about 6.5 hours of driving over
    // the trip" says exactly — the number that ruled out Villa Bottino in his
    // own villa search (Brennan, 11 Sept 2026). The concrete one stays.
    const over = budgetFlag(nightlyOf(c.nightly ?? null, c.total ?? null, baseNights), ctx.nightlyRate);
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
  const { data: nowSeen } = await supabase.from("stay_candidates").update({ status: "seen" }).eq("trip_id", trip.id).eq("base", baseIndex).eq("status", "candidate").is("feel", null).select("id");
  // A place that has come back is on the list again, so its old set-aside row
  // must go: otherwise the same hotel sits in the five AND under "N earlier".
  const backAgain = repeated > 0 ? cands.filter((c) => c.total != null).map((c) => c.name) : [];
  if (backAgain.length) {
    await supabase.from("stay_candidates").delete()
      .eq("trip_id", trip.id).eq("base", baseIndex).eq("status", "seen").in("name", backAgain);
  }
  await supabase.from("stay_candidates").delete().eq("trip_id", trip.id).eq("base", baseIndex).or("status.in.(saved,chosen),feel.eq.up");

  const rows = scored.map((s, i) => {
    const rv = s.c.google_place_id ? notes.get(s.c.google_place_id) : undefined;
    const delta = driveDelta(s.hours, bestHours);
    const prior = keptFor(s.c);
    return {
      trip_id: trip.id,
      user_id: user.id,
      base: baseIndex,
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
  // There is one brief row per journey but a line of copy per base, so the
  // area sentence is kept inside the brief JSON keyed by base and merged with
  // what the other base's run already wrote. Switching to Osaka must not blank
  // Tokyo's line.
  // One base: where to sit relative to the centre. Several: where THIS one
  // is, because the whole-journey direction belongs to neither of them.
  const thisArea = (brief.bases.length > 1
    ? [baseArea(brief, baseIndex)]
    : [headline, line]
  ).concat(priceWindowNote(priced, baseStart)).filter(Boolean).join(" ") || null;
  const { data: prevBrief } = await supabase.from("stay_briefs").select("brief").eq("trip_id", trip.id).maybeSingle();
  const prevJson = (prevBrief?.brief ?? {}) as { areaByBase?: Record<string, string | null> };
  const areaByBase = { ...(prevJson.areaByBase ?? {}), [String(baseIndex)]: thisArea };
  const briefRow = {
    trip_id: trip.id,
    user_id: user.id,
    ran_at: new Date().toISOString(),
    brief: { ...JSON.parse(JSON.stringify(brief)), wants: asked || null, areaByBase, lastBase: baseIndex },
    area_text: [
      thisArea,
      repeatNote(centre.label, repeated, freshOffers),
      exhausted ? exhaustedNote(centre.label, cands.filter((c) => c.total != null).length, seenRows.length + rejected.length) : null,
    ].filter(Boolean).join(" ") || null,
    price_year: priced.shifted ? Number(priced.start.slice(0, 4)) : null,
    split_text: splitText(brief, centreMinutes),
  };
  const { error: briefErr } = await supabase.from("stay_briefs").upsert(briefRow, { onConflict: "trip_id" });
  if (briefErr) return NextResponse.json({ error: briefErr.message }, { status: 500 });

  const { data: all } = await supabase.from("stay_candidates").select("*").eq("trip_id", trip.id).order("letter");
  const newIds = ((written ?? []) as { id: string; status: string; feel: string | null }[]).filter((r) => r.status === "candidate" && !r.feel).map((r) => r.id);
  return NextResponse.json({ brief: briefRow, candidates: all ?? written, undo: { tripId: trip.id, seenIds: (nowSeen ?? []).map((r) => r.id), newIds } });
}
