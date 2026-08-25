"use server";

// "Try a sample trip" — builds the Lisbon sample journey for the signed-in
// user from the snapshot in this folder. Everything is inserted as the
// CALLER through the normal RLS-scoped client (no service role): the places
// are full enriched copies (google_place_id, coords, hours, photos), so the
// map pins, photos and card sheets all render — this deliberately does NOT
// create bare places rows.

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import samplePlaces from "./places.json";
import {
  SAMPLE_TITLE,
  SAMPLE_DESTINATION,
  SAMPLE_COVER,
  SAMPLE_DAYS,
  SAMPLE_INTERESTED,
  type SampleCard,
} from "./itinerary";

type PlaceRow = Record<string, unknown> & { id: string; google_place_id: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function createSampleJourney(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // ── Places: reuse the user's existing row per google_place_id (same dedup
  //    key bulk-import uses), otherwise insert an enriched copy as this user.
  const snapshot = samplePlaces as PlaceRow[];
  const gids = snapshot.map((p) => p.google_place_id);

  const { data: existing } = await supabase
    .from("places")
    .select("id, google_place_id")
    .eq("user_id", user.id)
    .in("google_place_id", gids);

  const placeIdByGid = new Map<string, string>();
  for (const row of existing ?? []) placeIdByGid.set(row.google_place_id, row.id);

  const toInsert = snapshot
    .filter((p) => !placeIdByGid.has(p.google_place_id))
    .map((p) => {
      const copy: Record<string, unknown> = { ...p };
      delete copy.created_at;
      delete copy.updated_at;
      copy.id = randomUUID();
      copy.user_id = user.id;
      copy.archived = false;
      copy.archived_at = null;
      placeIdByGid.set(p.google_place_id, copy.id as string);
      return copy;
    });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("places").insert(toInsert);
    if (error) throw new Error(`Sample trip: couldn't copy places — ${error.message}`);
  }

  // ── Trip: starts today so it lands in "upcoming", clearly named as a sample.
  const tripId = randomUUID();
  const start = new Date();
  const end = new Date(start.getTime() + (SAMPLE_DAYS.length - 1) * 86400000);

  const { error: tripErr } = await supabase.from("trips").insert({
    id: tripId,
    user_id: user.id,
    title: SAMPLE_TITLE,
    destination: SAMPLE_DESTINATION.name,
    destination_lat: SAMPLE_DESTINATION.lat,
    destination_lng: SAMPLE_DESTINATION.lng,
    start_date: isoDate(start),
    end_date: isoDate(end),
    party_size: 2,
    status: "planning",
    cover_image_url: SAMPLE_COVER,
  });
  if (tripErr) throw new Error(`Sample trip: couldn't create journey — ${tripErr.message}`);

  // ── Days
  const dayRows = SAMPLE_DAYS.map((_, i) => ({
    id: randomUUID(),
    trip_id: tripId,
    date: isoDate(new Date(start.getTime() + i * 86400000)),
    day_number: i + 1,
  }));
  const { error: daysErr } = await supabase.from("days").insert(dayRows);
  if (daysErr) throw new Error(`Sample trip: couldn't create days — ${daysErr.message}`);

  // ── Cards: scheduled per day (contiguous 1-based positions), plus the
  //    saved-but-unscheduled ideas (day_id null, position 0).
  const toCard = (c: SampleCard, dayId: string | null, position: number) => ({
    id: randomUUID(),
    trip_id: tripId,
    day_id: dayId,
    place_id: placeIdByGid.get(c.googlePlaceId),
    status: dayId ? "in_itinerary" : "interested",
    position,
    start_time: c.startTime ?? null,
    end_time: c.endTime ?? null,
    confirmed: false,
    details: c.notes ? { notes: c.notes } : {},
  });

  const cardRows = [
    ...SAMPLE_DAYS.flatMap((dayCards, i) =>
      dayCards.map((c, j) => toCard(c, dayRows[i].id, j + 1)),
    ),
    ...SAMPLE_INTERESTED.map((c) => toCard(c, null, 0)),
  ];
  const { error: cardsErr } = await supabase.from("cards").insert(cardRows);
  if (cardsErr) throw new Error(`Sample trip: couldn't create cards — ${cardsErr.message}`);

  redirect(`/trips/${tripId}`);
}
