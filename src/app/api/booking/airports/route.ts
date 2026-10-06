import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { overBudget, addSpend } from "@/lib/api/spend";
import { createAdminClient } from "@/lib/supabase/admin";
import { AIRPORTS_MODEL, airportsKey, airportsPrompt, parseAirports } from "@/lib/booking/airports";

// ── The airports a journey flies into, for the To book checklist (6 Oct 2026) ──
//
// Kayak's flight search needs IATA codes (a town in the route is dropped).
// Claude Haiku is asked once per destination, ever: the answer is kept in
// public.find_cache under "airports|<destination>" with no expiry, because an
// airport does not move. The Bookings sheet asks lazily, only for its owner,
// only while Flights or Car is open and the journey's own flight cards carry
// no codes (lib/booking/checklist needsAirports).

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { tripId?: string } | null;
  const tripId = body?.tripId;
  if (!tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });

  // RLS returns the journey to its owner and its guests; only the owner gets this.
  const { data: trip } = await gate.supabase.from("trips").select("id, user_id, destination, destination_lat, destination_lng").eq("id", tripId).maybeSingle();
  if (!trip || trip.user_id !== gate.user.id) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  const destination = String(trip.destination ?? "").trim();
  if (!destination) return NextResponse.json({ airports: [] });

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }
  const key = airportsKey(destination);
  if (admin) {
    const { data: hit } = await admin.from("find_cache").select("results").eq("key", key).maybeSingle();
    const cached = (hit?.results as { airports?: unknown } | null)?.airports;
    if (Array.isArray(cached)) return NextResponse.json({ airports: cached, cached: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Airports are unavailable just now" }, { status: 502 });
  if (!(await underQuota(gate.supabase, "bookingAirports", QUOTA.bookingAirports))) return quotaExceeded("airport lookups");
  if (await overBudget(admin)) return NextResponse.json({ error: "Airports are paused until tomorrow" }, { status: 503 });

  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: AIRPORTS_MODEL,
      max_tokens: 100,
      messages: [{ role: "user", content: airportsPrompt(destination, trip.destination_lat as number | null, trip.destination_lng as number | null) }],
    });
    await addSpend(admin, "booking airports", res.usage as Parameters<typeof addSpend>[2], res.model);
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const airports = parseAirports(text);
    // Kept for good, even an empty answer: at most one call per destination, ever.
    if (admin) await admin.from("find_cache").upsert({ key, results: { airports }, created_at: new Date().toISOString() });
    return NextResponse.json({ airports });
  } catch (e) {
    console.error("[booking/airports]", e);
    return NextResponse.json({ error: "Airports are unavailable just now" }, { status: 502 });
  }
}
