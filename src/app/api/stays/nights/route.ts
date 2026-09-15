// PATCH /api/stays/nights { tripId, nights: { "Tokyo": 5 } } — how many nights
// each base gets, set by him. The brief guessed the split from pin counts
// (Tokyo 8 / Osaka 5 on Japan) and there was no way to correct it, so every
// price could be for the wrong week and Choose could write check-in on the
// wrong day (15 Sept 2026). Keyed by the base's label; the remaining bases
// share what is left. The caller re-runs the search so prices match.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { loadTripContext } from "../_shared";

export async function PATCH(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;

  const body = await request.json().catch(() => ({})) as { tripId?: string; nights?: Record<string, number> | null };
  if (!body.tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  const { data: trip } = await supabase.from("trips").select("id, user_id, stay_nights").eq("id", body.tripId).maybeSingle();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Not your journey" }, { status: 403 });

  // null clears the override; otherwise whole nights only, merged over what is set.
  let next: Record<string, number> | null = null;
  if (body.nights) {
    next = { ...((trip.stay_nights ?? {}) as Record<string, number>) };
    for (const [label, n] of Object.entries(body.nights)) {
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return NextResponse.json({ error: "Nights must be a whole number" }, { status: 400 });
      next[label] = Math.trunc(n);
    }
  }
  const { error } = await supabase.from("trips").update({ stay_nights: next }).eq("id", trip.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The brief with the new split, so the sheet can show it before the re-run.
  const ctx = await loadTripContext(supabase, trip.id, user.id);
  return NextResponse.json({ ok: true, stayNights: next, bases: ctx?.brief.bases ?? [] });
}
