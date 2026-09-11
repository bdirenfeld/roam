// POST /api/stays/mark { candidateId, action: "save" | "reject", reason? }
//   save   — the candidate becomes an ordinary saved place (a card with no
//            day, like any pin), and stays on the list as "saved".
//   reject — "Not for us", with the reason the next search learns from.

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { ensurePlace } from "../_shared";
import type { StayCandidate, StayRejectReason } from "@/types/database";

const REASONS = new Set<StayRejectReason>(["too_far", "wrong_kind", "too_dear", "doesnt_fit"]);

/**
 * The first letter not in use on this base, so a row coming back onto the list
 * never collides with one already there. Both ways back — restore from Earlier
 * and un-reject — go through here.
 */
async function freeLetter(
  supabase: SupabaseClient,
  tripId: string,
  base: number,
  current: string | null,
): Promise<string | null> {
  const { data: live } = await supabase
    .from("stay_candidates")
    .select("letter")
    .eq("trip_id", tripId)
    .eq("base", base)
    .not("status", "in", "(rejected,seen)");
  const taken = new Set(((live ?? []) as { letter: string | null }[]).map((r) => r.letter).filter(Boolean));
  return "ABCDEFGHIJKL".split("").find((l) => !taken.has(l)) ?? current;
}

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "stayWrite", QUOTA.stayWrite))) return quotaExceeded("stay changes");

  const body = await request.json().catch(() => ({})) as { candidateId?: string; action?: string; reason?: string };
  if (!body.candidateId || !["save", "unsave", "reject", "unreject", "heart", "restore"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "candidateId and action (save | unsave | reject | unreject | heart | restore) are required" }, { status: 400 });
  }
  const { data: cand } = await supabase.from("stay_candidates").select("*").eq("id", body.candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "No such candidate" }, { status: 404 });
  const c = cand as StayCandidate;
  const { data: trip } = await supabase.from("trips").select("id, user_id").eq("id", c.trip_id).maybeSingle();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });

  // A heart: kept on the next run and steers what it looks for. Tap again to take it back.
  if (body.action === "heart") {
    const feel = c.feel === "up" ? null : "up";
    const { error } = await supabase.from("stay_candidates").update({ feel }).eq("id", c.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, feel });
  }

  // Bring back one that a Run again pushed aside. Replacing five with five
  // used to be recoverable only through a toast that expires, so pressing the
  // button by accident lost them for good (Brennan, 10 Sept 2026).
  if (body.action === "restore") {
    // It comes back with a FREE letter. Keeping its old one put two rows
    // labelled A on the Japan list, and the letters are what tie a row to its
    // pin (audit, 10 Sept 2026).
    const letter = await freeLetter(supabase, c.trip_id, c.base ?? 0, c.letter);
    const { error } = await supabase.from("stay_candidates").update({ status: "candidate", letter }).eq("id", c.id).eq("status", "seen");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "candidate", letter });
  }

  if (body.action === "unreject") {
    // Same free-letter rule as restore. Coming back with the letter it had
    // meant two rows labelled the same once a later run had reassigned it —
    // and the letters are what tie a row to its pin (audit, 11 Sept 2026).
    const status = c.place_id ? "saved" : "candidate";
    const letter = await freeLetter(supabase, c.trip_id, c.base ?? 0, c.letter);
    const { error } = await supabase.from("stay_candidates").update({ status, reject_reason: null, letter }).eq("id", c.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status, letter });
  }

  if (body.action === "reject") {
    const reason = REASONS.has(body.reason as StayRejectReason) ? (body.reason as StayRejectReason) : null;
    if (c.status === "chosen") return NextResponse.json({ error: "Un-choose it first" }, { status: 409 });
    const { error } = await supabase.from("stay_candidates").update({ status: "rejected", reject_reason: reason }).eq("id", c.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Undo of Save: the card goes, the place goes if Save created it and nothing
  // else points at it, and the row is a candidate again.
  if (body.action === "unsave") {
    const u = body as { cardId?: string; createdPlace?: boolean };
    if (c.status === "chosen") return NextResponse.json({ error: "It is your stay; undo that first" }, { status: 409 });
    if (u.cardId) {
      const { error } = await supabase.from("cards").delete().eq("id", u.cardId).eq("trip_id", c.trip_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (u.createdPlace && c.place_id) {
      const { count } = await supabase.from("cards").select("id", { count: "exact", head: true }).eq("place_id", c.place_id);
      if (!count) await supabase.from("places").delete().eq("id", c.place_id);
    }
    const { error: rowErr } = await supabase.from("stay_candidates").update({ status: "candidate", place_id: u.createdPlace ? null : c.place_id }).eq("id", c.id);
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const hadPlace = !!c.place_id;
  const placeId = await ensurePlace(supabase, user.id, c);
  if (!placeId) return NextResponse.json({ error: "Couldn't save the place" }, { status: 500 });
  // Already on the journey? Then there is nothing to add.
  const { data: existing } = await supabase.from("cards").select("id").eq("trip_id", c.trip_id).eq("place_id", placeId).neq("status", "cut").limit(1);
  let cardId = existing?.[0]?.id ?? null;
  const createdCard = !cardId;
  if (!cardId) {
    cardId = crypto.randomUUID();
    const { error } = await supabase.from("cards").insert({
      id: cardId, trip_id: c.trip_id, day_id: null, place_id: placeId, status: "interested", position: 0,
      start_time: null, end_time: null, source_url: c.url, details: {}, ai_generated: false, confirmed: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { error: markErr } = c.status !== "chosen"
    ? await supabase.from("stay_candidates").update({ status: "saved", place_id: placeId }).eq("id", c.id)
    : await supabase.from("stay_candidates").update({ place_id: placeId }).eq("id", c.id);
  if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, placeId, cardId, createdCard, createdPlace: !hadPlace });
}
