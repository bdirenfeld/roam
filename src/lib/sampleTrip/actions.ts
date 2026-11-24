"use server";

// Opens the sample journey: builds it for the signed-in user from the snapshot
// in this folder, or reopens the one they have. Everything is inserted as the
// CALLER through the normal RLS-scoped client (no service role): the places
// are full enriched copies (google_place_id, coords, hours, photos), so the
// map pins, photos and card sheets all render.

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import samplePlaces from "./places.json";
import { SAMPLE_TITLE } from "./itinerary";
import { buildSample, type SamplePlace } from "./plan";

export async function createSampleJourney(): Promise<void> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) redirect("/");

  // A second tap, or a second visit, opens the one already there.
  const { data: have } = await supabase
    .from("trips").select("id").eq("user_id", user.id).eq("title", SAMPLE_TITLE).limit(1);
  if (have?.[0]) redirect(`/trips/${have[0].id}`);

  // Places: reuse the user's existing row per google_place_id (same dedup key
  // bulk-import uses), otherwise insert an enriched copy as this user.
  const snapshot = samplePlaces as unknown as SamplePlace[];
  const { data: existing } = await supabase
    .from("places").select("id, google_place_id").eq("user_id", user.id)
    .in("google_place_id", snapshot.map((p) => p.google_place_id));
  const placeId = new Map<string, string>();
  for (const row of existing ?? []) placeId.set(row.google_place_id, row.id);
  const copies = snapshot.filter((p) => !placeId.has(p.google_place_id)).map((p) => {
    const id: string = randomUUID();
    placeId.set(p.google_place_id, id);
    return { ...p, id, user_id: user.id };
  });

  const rows = buildSample({ userId: user.id, today: new Date(), newId: () => randomUUID(), placeId, snapshot });
  const put = async (table: "places" | "trips" | "days" | "cards", data: unknown) => {
    const { error } = await supabase.from(table).insert(data as never);
    if (error) throw new Error(`Sample trip: couldn't add ${table}: ${error.message}`);
  };
  if (copies.length) await put("places", copies);
  await put("places", rows.legPlaces);
  await put("trips", rows.trip);
  await put("days", rows.days);
  await put("cards", rows.cards);

  redirect(`/trips/${rows.trip.id}`);
}
