// POST /api/stays/mark { candidateId, action: "save" | "reject", reason? }
//   save   — the candidate becomes an ordinary saved place (a card with no
//            day, like any pin), and stays on the list as "saved".
//   reject — "Not for us", with the reason the next search learns from.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { ensurePlace } from "../_shared";
import type { StayCandidate, StayRejectReason } from "@/types/database";

const REASONS = new Set<StayRejectReason>(["too_far", "wrong_kind", "too_dear", "doesnt_fit"]);

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;
  if (!(await underQuota(supabase, "stayWrite", QUOTA.stayWrite))) return quotaExceeded("stay changes");

  const body = await request.json().catch(() => ({})) as { candidateId?: string; action?: string; reason?: string };
  if (!body.candidateId || (body.action !== "save" && body.action !== "reject" && body.action !== "heart")) {
    return NextResponse.json({ error: "candidateId and action (save | reject | heart) are required" }, { status: 400 });
  }
  const { data: cand } = await supabase.from("stay_candidates").select("*").eq("id", body.candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "No such candidate" }, { status: 404 });
  const c = cand as StayCandidate;
  const { data: trip } = await supabase.from("trips").select("id, user_id").eq("id", c.trip_id).maybeSingle();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });

  // A heart: kept on the next run and steers what it looks for. Tap again to take it back.
  if (body.action === "heart") {
    const feel = c.feel === "up" ? null : "up";
    await supabase.from("stay_candidates").update({ feel }).eq("id", c.id);
    return NextResponse.json({ ok: true, feel });
  }

  if (body.action === "reject") {
    const reason = REASONS.has(body.reason as StayRejectReason) ? (body.reason as StayRejectReason) : null;
    if (c.status === "chosen") return NextResponse.json({ error: "Un-choose it first" }, { status: 409 });
    await supabase.from("stay_candidates").update({ status: "rejected", reject_reason: reason }).eq("id", c.id);
    return NextResponse.json({ ok: true });
  }

  const placeId = await ensurePlace(supabase, user.id, c);
  if (!placeId) return NextResponse.json({ error: "Couldn't save the place" }, { status: 500 });
  // Already on the journey? Then there is nothing to add.
  const { data: existing } = await supabase.from("cards").select("id").eq("trip_id", c.trip_id).eq("place_id", placeId).neq("status", "cut").limit(1);
  let cardId = existing?.[0]?.id ?? null;
  if (!cardId) {
    cardId = crypto.randomUUID();
    const { error } = await supabase.from("cards").insert({
      id: cardId, trip_id: c.trip_id, day_id: null, place_id: placeId, status: "interested", position: 0,
      start_time: null, end_time: null, source_url: c.url, details: {}, ai_generated: false, confirmed: false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (c.status !== "chosen") await supabase.from("stay_candidates").update({ status: "saved", place_id: placeId }).eq("id", c.id);
  else await supabase.from("stay_candidates").update({ place_id: placeId }).eq("id", c.id);
  return NextResponse.json({ ok: true, placeId, cardId });
}
