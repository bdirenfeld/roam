import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { deleteJourney } from "@/lib/deleteJourney";
import { copyJourney, type CopyCardRow, type CopyDayRow, type CopyTripRow } from "@/lib/trips/copyJourney";

/**
 * Copy to new dates (7 Oct 2026, mock t07). Runs as the signed-in person, so
 * RLS decides what they can read and write; the owner check is explicit too
 * (a guest or cohost can read a journey but never copy it from here).
 *
 * All or nothing without a schema change: the journey, its days and its cards
 * go in three statements (each one atomic on its own), and if the days or the
 * cards are refused the new journey is deleted again (lib/deleteJourney), so a
 * failure never leaves half a copy on the Journeys list.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    tripId?: string; title?: string; startDate?: string; partySize?: number; partyAges?: number[] | null; includeSaved?: boolean;
  };
  const { tripId, startDate } = body;
  const title = (body.title ?? "").trim();
  if (!tripId || !startDate || !ISO.test(startDate) || !title) {
    return NextResponse.json({ error: "Name and start date are needed." }, { status: 400 });
  }
  const partySize = Number.isFinite(body.partySize) && (body.partySize as number) >= 1 ? Math.round(body.partySize as number) : 1;
  const partyAges = Array.isArray(body.partyAges) ? body.partyAges.filter((a) => Number.isFinite(a)).map(Number) : null;

  const [tripRes, daysRes, cardsRes] = await Promise.all([
    supabase.from("trips").select("id, user_id, title, destination, destination_lat, destination_lng, start_date, end_date, trip_purpose, trip_type, cruise, party_size, party_ages, accommodation_name, accommodation_address, stay_nights, cover_image_url, notes").eq("id", tripId).maybeSingle(),
    supabase.from("days").select("id, date, day_number, day_name, theme, narrative_position").eq("trip_id", tripId).order("day_number"),
    supabase.from("cards").select("id, day_id, status, archived, place_id, start_time, end_time, position, details, confirmed, source_url, ai_generated, place:places(sub_type)").eq("trip_id", tripId),
  ]);
  const src = tripRes.data as CopyTripRow | null;
  if (tripRes.error || !src) return NextResponse.json({ error: "Couldn't find that journey." }, { status: 404 });
  if (src.user_id !== user.id) return NextResponse.json({ error: "Only the journey's owner can copy it." }, { status: 403 });
  if (daysRes.error || cardsRes.error) return NextResponse.json({ error: "Couldn't read the journey. Try again." }, { status: 500 });

  const out = copyJourney(
    { trip: src, days: (daysRes.data ?? []) as CopyDayRow[], cards: (cardsRes.data ?? []) as unknown as CopyCardRow[] },
    { userId: user.id, title, startDate, partySize, partyAges, includeSaved: body.includeSaved !== false, newId: () => crypto.randomUUID() },
  );
  const newId = out.trip.id as string;

  const { error: tripErr } = await supabase.from("trips").insert(out.trip);
  if (tripErr) {
    console.error("[copy] trip refused:", tripErr.message);
    return NextResponse.json({ error: "Couldn't copy this journey. Try again." }, { status: 500 });
  }
  const undo = async (what: string, message: string) => {
    console.error(`[copy] ${what} refused:`, message);
    const failure = await deleteJourney(supabase, newId);
    if (failure) console.error("[copy] cleanup failed:", failure);
    return NextResponse.json({ error: "Couldn't copy this journey. Nothing was created. Try again." }, { status: 500 });
  };
  if (out.days.length) {
    const { error } = await supabase.from("days").insert(out.days);
    if (error) return undo("days", error.message);
  }
  // In slices: one statement per slice, and any refusal takes the whole copy back.
  for (let i = 0; i < out.cards.length; i += 500) {
    const { error } = await supabase.from("cards").insert(out.cards.slice(i, i + 500));
    if (error) return undo("cards", error.message);
  }

  return NextResponse.json({ tripId: newId, firstDayId: (out.days[0]?.id as string | undefined) ?? null, counts: out.counts });
}
