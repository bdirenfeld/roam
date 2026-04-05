import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GENERIC_TITLES = new Set([
  "Dinner",
  "Lunch",
  "Breakfast",
  "Aperitivo",
  "Morning Coffee",
  "Coffee",
  "Activity",
  "Night Walk",
  "Afternoon Wandering",
  "Afternoon Relax",
]);

export async function POST(req: NextRequest) {
  const { trip_id } = await req.json();
  if (!trip_id) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_PLACES_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Fetch all in-itinerary cards for the trip
  const { data: cards, error } = await supabase
    .from("cards")
    .select("id, title, details")
    .eq("trip_id", trip_id)
    .eq("status", "in_itinerary")
    .eq("type", "food");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter to cards with a generic title that have a place_id stored in details
  const eligible = (cards ?? []).filter((card) => {
    if (!GENERIC_TITLES.has(card.title)) return false;
    const details = card.details as Record<string, unknown> | null;
    return typeof details?.place_id === "string" && details.place_id !== "";
  });

  if (!eligible.length) {
    return NextResponse.json({ updated: 0, renames: [] });
  }

  const renames: { id: string; from: string; to: string }[] = [];

  for (const card of eligible) {
    const details = card.details as Record<string, unknown>;
    const placeId = details.place_id as string;

    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("fields", "name");
      url.searchParams.set("key", apiKey);

      const res  = await fetch(url.toString(), { next: { revalidate: 0 } });
      const data = await res.json() as { result?: { name?: string } };
      const placeName = data.result?.name;

      if (!placeName || card.title.includes(placeName)) continue;

      const newTitle = `${card.title} \u2014 ${placeName}`;

      await supabase
        .from("cards")
        .update({ title: newTitle, details: details || {} })
        .eq("id", card.id);

      renames.push({ id: card.id, from: card.title, to: newTitle });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ updated: renames.length, renames });
}
