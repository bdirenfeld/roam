// POST /api/stays/choose { candidateId } — make this candidate the stay.
//   1. a check-in card on the first day and a check-out card on the last,
//      cutting any other stay's cards on those two days;
//   2. trips.accommodation_name/address, which the guest page reads;
//   3. the Estimate's nightly rate, when the candidate has a price.
// Returns an undo payload. DELETE with that payload puts everything back.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { ensurePlace, nextPosition } from "../_shared";
import { nightlyFrom } from "@/lib/stays/price";
import type { StayCandidate } from "@/types/database";

interface Undo {
  tripId: string;
  candidateId: string;
  newCardIds: string[];
  cutCards: { id: string; status: string }[];
  prevChosenId: string | null;
  prevAccommodation: { name: string | null; address: string | null };
  prevNightly: number | null | undefined;
  prevBasis: string | null | undefined;
  /** The candidate's status before Choose, and whether Choose had to create its place. */
  prevStatus: string;
  createdPlace: boolean;
}

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "stayWrite", QUOTA.stayWrite))) return quotaExceeded("stay changes");

  const body = await request.json().catch(() => ({})) as { candidateId?: string };
  if (!body.candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  const { data: cand } = await supabase.from("stay_candidates").select("*").eq("id", body.candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "No such candidate" }, { status: 404 });
  const c = cand as StayCandidate & { google_place_id: string | null };

  const [{ data: trip }, { data: days }] = await Promise.all([
    supabase.from("trips").select("id, user_id, start_date, end_date, accommodation_name, accommodation_address").eq("id", c.trip_id).maybeSingle(),
    supabase.from("days").select("id, date, day_number").eq("trip_id", c.trip_id).order("day_number"),
  ]);
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });
  if (!days || days.length < 2) return NextResponse.json({ error: "The journey needs its days first" }, { status: 422 });

  const hadPlace = !!c.place_id;
  const placeId = await ensurePlace(supabase, user.id, c);
  if (!placeId) return NextResponse.json({ error: "Couldn't save the place" }, { status: 500 });

  /**
   * A stay covers the nights of ITS base, not the whole journey.
   *
   * Japan is Tokyo for eight nights then Osaka for five, so choosing the Osaka
   * hotel used to write check-in on day one and check-out on day fourteen —
   * overwriting Tokyo's stay and claiming a booking nobody made (Brennan,
   * 10 Sept 2026, "the part that is not UI"). The bases run in order from the
   * start date, so base n begins after everything before it has been slept.
   */
  const { data: briefRow } = await supabase.from("stay_briefs").select("brief").eq("trip_id", c.trip_id).maybeSingle();
  const bases = (((briefRow?.brief ?? {}) as { bases?: { nights: number }[] }).bases ?? []);
  const baseIndex = Math.max(0, Math.min(Math.max(0, bases.length - 1), c.base ?? 0));
  const multiBase = bases.length > 1;
  const nightsBefore = multiBase ? bases.slice(0, baseIndex).reduce((n, b) => n + b.nights, 0) : 0;
  const baseNights = multiBase ? (bases[baseIndex]?.nights ?? days.length - 1) : days.length - 1;
  const firstIdx = Math.min(nightsBefore, days.length - 2);
  const lastIdx = Math.min(firstIdx + baseNights, days.length - 1);

  const first = days[firstIdx];
  const last = days[lastIdx];

  // Other stays on the arrival and departure days step aside.
  const { data: stayCards } = await supabase
    .from("cards")
    .select("id, status, place_id, day_id, place:places!inner (sub_type)")
    .eq("trip_id", c.trip_id)
    .in("day_id", [first.id, last.id])
    .neq("status", "cut")
    .in("place.sub_type", ["hotel", "accommodation"]);
  const cutCards = ((stayCards ?? []) as { id: string; status: string; place_id: string | null }[])
    .filter((k) => k.place_id !== placeId)
    .map((k) => ({ id: k.id, status: k.status }));
  // Every write is checked. If one fails after another has landed, what landed
  // is put back and the caller hears about it — half a choice behind a toast
  // that says it worked is the worst outcome (audit, 10 Sept 2026).
  const inId = crypto.randomUUID();
  const outId = crypto.randomUUID();
  let cardsInserted = false;
  let cardsCut = false;
  const rollback = async () => {
    if (cardsInserted) await supabase.from("cards").delete().in("id", [inId, outId]);
    if (cardsCut) for (const k of cutCards) await supabase.from("cards").update({ status: k.status }).eq("id", k.id);
  };
  const failed = async (what: string, message: string) => {
    await rollback();
    console.error("[stays/choose]", what, message);
    return NextResponse.json({ error: `Couldn't ${what}. Nothing was changed.` }, { status: 500 });
  };

  if (cutCards.length) {
    const { error } = await supabase.from("cards").update({ status: "cut" }).in("id", cutCards.map((k) => k.id));
    if (error) return failed("move the old stay aside", error.message);
    cardsCut = true;
  }

  const [posIn, posOut] = await Promise.all([nextPosition(supabase, first.id), nextPosition(supabase, last.id)]);
  const { error: cardErr } = await supabase.from("cards").insert([
    { id: inId, trip_id: c.trip_id, day_id: first.id, place_id: placeId, status: "in_itinerary", position: posIn, start_time: "15:00:00", end_time: null, details: { stay: "check_in" }, ai_generated: false, confirmed: false },
    { id: outId, trip_id: c.trip_id, day_id: last.id, place_id: placeId, status: "in_itinerary", position: posOut, start_time: "10:00:00", end_time: null, details: { stay: "check_out" }, ai_generated: false, confirmed: false },
  ]);
  if (cardErr) return failed("add the check-in and check-out", cardErr.message);
  cardsInserted = true;

  // The journey carries one accommodation name, which only the first base can
  // honestly fill. Choosing the Osaka hotel must not relabel the whole trip;
  // the check-in and check-out cards above are what say where you sleep when.
  if (baseIndex === 0) {
    const { error } = await supabase.from("trips").update({ accommodation_name: c.name, accommodation_address: c.address }).eq("id", c.trip_id);
    if (error) return failed("note where you're staying", error.message);
  }

  // The Estimate line, only when there is a real number to put on it. On a
  // multi-base journey it is the blended rate across every stay chosen so far,
  // because one nightly figure has to cover the whole trip.
  let prevNightly: number | null | undefined;
  let prevBasis: string | null | undefined;
  const nights = Math.max(1, lastIdx - firstIdx);
  let nightly = c.nightly_cad ?? nightlyFrom(c.total, nights);
  if (multiBase && nightly != null) {
    const { data: chosenRows } = await supabase
      .from("stay_candidates")
      .select("base, total, nightly_cad")
      .eq("trip_id", c.trip_id)
      .eq("status", "chosen");
    let spend = Number(nightly) * nights;
    let covered = nights;
    for (const r of chosenRows ?? []) {
      if ((r.base ?? 0) === baseIndex) continue;               // this one is counted above
      const n = bases[r.base ?? 0]?.nights ?? 0;
      const each = r.nightly_cad ?? nightlyFrom(r.total, n);
      if (each == null || n <= 0) continue;
      spend += Number(each) * n;
      covered += n;
    }
    if (covered > 0) nightly = Math.round(spend / covered);
  }
  if (nightly != null) {
    const { data: budget } = await supabase.from("trip_budgets").select("assumptions, basis").eq("trip_id", c.trip_id).maybeSingle();
    if (budget) {
      const a = (budget.assumptions ?? {}) as Record<string, unknown>;
      const b = (budget.basis ?? {}) as Record<string, string>;
      prevNightly = a.nightlyRate as number | undefined;
      prevBasis = b.accommodation;
      const when = new Date().toLocaleDateString("en-CA", { day: "numeric", month: "short" });
      const { error } = await supabase.from("trip_budgets").update({
        assumptions: { ...a, nightlyRate: nightly },
        basis: { ...b, accommodation: `${c.name} · ${c.site ?? "listing"} · ${when}` },
        updated_at: new Date().toISOString(),
      }).eq("trip_id", c.trip_id);
      if (error) {
        await supabase.from("trips").update({ accommodation_name: trip.accommodation_name, accommodation_address: trip.accommodation_address }).eq("id", c.trip_id);
        return failed("update the Estimate", error.message);
      }
    }
  }

  const { data: prevChosen } = await supabase.from("stay_candidates").select("id").eq("trip_id", c.trip_id).eq("status", "chosen").neq("id", c.id).maybeSingle();
  if (prevChosen) {
    const { error } = await supabase.from("stay_candidates").update({ status: "saved" }).eq("id", prevChosen.id);
    if (error) return failed("mark the stay", error.message);
  }
  {
    const { error } = await supabase.from("stay_candidates").update({ status: "chosen", place_id: placeId }).eq("id", c.id);
    if (error) return failed("mark the stay", error.message);
  }

  const undo: Undo = {
    tripId: c.trip_id, candidateId: c.id, newCardIds: [inId, outId], cutCards,
    prevChosenId: prevChosen?.id ?? null,
    prevAccommodation: { name: trip.accommodation_name, address: trip.accommodation_address },
    prevNightly, prevBasis,
    prevStatus: c.status,
    createdPlace: !hadPlace,
  };
  return NextResponse.json({ ok: true, placeId, cardIds: [inId, outId], undo });
}

/** Reverse a Choose with the payload it returned. */
export async function DELETE(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;

  const undo = await request.json().catch(() => null) as Undo | null;
  if (!undo?.tripId) return NextResponse.json({ error: "undo payload is required" }, { status: 400 });
  const { data: trip } = await supabase.from("trips").select("id, user_id").eq("id", undo.tripId).maybeSingle();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });

  if (undo.newCardIds?.length) await supabase.from("cards").delete().in("id", undo.newCardIds);
  for (const k of undo.cutCards ?? []) await supabase.from("cards").update({ status: k.status }).eq("id", k.id);
  await supabase.from("trips").update({ accommodation_name: undo.prevAccommodation?.name ?? null, accommodation_address: undo.prevAccommodation?.address ?? null }).eq("id", undo.tripId);
  if (undo.prevNightly !== undefined) {
    const { data: budget } = await supabase.from("trip_budgets").select("assumptions, basis").eq("trip_id", undo.tripId).maybeSingle();
    if (budget) {
      const a = { ...((budget.assumptions ?? {}) as Record<string, unknown>) };
      const b = { ...((budget.basis ?? {}) as Record<string, string>) };
      if (undo.prevNightly == null) delete a.nightlyRate; else a.nightlyRate = undo.prevNightly;
      if (undo.prevBasis == null) delete b.accommodation; else b.accommodation = undo.prevBasis;
      await supabase.from("trip_budgets").update({ assumptions: a, basis: b }).eq("trip_id", undo.tripId);
    }
  }
  // Back to what it was; a place created only for this choice goes too, once no card points at it.
  const { data: cand } = await supabase.from("stay_candidates").select("place_id").eq("id", undo.candidateId).maybeSingle();
  const prevStatus = undo.prevStatus === "saved" || undo.prevStatus === "candidate" ? undo.prevStatus : "candidate";
  if (undo.createdPlace && cand?.place_id) {
    const { count } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("place_id", cand.place_id);
    if (!count) {
      await supabase.from("stay_candidates").update({ status: prevStatus, place_id: null }).eq("id", undo.candidateId);
      await supabase.from("places").delete().eq("id", cand.place_id);
    } else {
      await supabase.from("stay_candidates").update({ status: "saved" }).eq("id", undo.candidateId);
    }
  } else {
    await supabase.from("stay_candidates").update({ status: prevStatus === "candidate" && !cand?.place_id ? "candidate" : "saved" }).eq("id", undo.candidateId);
  }
  if (undo.prevChosenId) await supabase.from("stay_candidates").update({ status: "chosen" }).eq("id", undo.prevChosenId);
  return NextResponse.json({ ok: true });
}
