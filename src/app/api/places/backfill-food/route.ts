import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ROME_TRIP_ID = "338bdff4-5581-48b9-9c5b-deff8a54a7d9";

export async function POST() {
  const supabase = await createClient();
  const key = process.env.GOOGLE_PLACES_API_KEY;

  const { data: cards, error } = await supabase
    .from("cards")
    .select("id, details")
    .eq("trip_id", ROME_TRIP_ID)
    .eq("type", "food");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cards?.length) return NextResponse.json({ updated: 0, total: 0 });

  let updated = 0;
  for (const card of cards) {
    const details  = (card.details ?? {}) as Record<string, unknown>;
    const placeId  = details.place_id as string | undefined;
    const hasBoth  = details.price_level != null && details.currency_code;
    if (hasBoth) continue;

    const newDetails: Record<string, unknown> = {
      ...details,
      currency_code: details.currency_code ?? "EUR",
    };

    // Fetch price_level from Google Places if we have a place_id and don't yet have price_level
    if (placeId && key && details.price_level == null) {
      try {
        const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        url.searchParams.set("place_id", placeId);
        url.searchParams.set("fields", "price_level");
        url.searchParams.set("key", key);
        const res  = await fetch(url.toString());
        const data = await res.json() as { result?: { price_level?: number } };
        if (data.result?.price_level != null) {
          newDetails.price_level = data.result.price_level;
        }
      } catch {
        // ignore, still update currency_code
      }
    }

    await supabase
      .from("cards")
      .update({ details: newDetails })
      .eq("id", card.id);

    updated++;
  }

  return NextResponse.json({ updated, total: cards.length });
}
