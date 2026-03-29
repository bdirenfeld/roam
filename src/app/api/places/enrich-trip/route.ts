import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { tripId } = await req.json();
  const supabase = createClient();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  // Fetch all cards missing cover_image_url
  const { data: cards } = await supabase
    .from("cards")
    .select("id, title, lat, lng")
    .eq("trip_id", tripId)
    .is("cover_image_url", null);

  if (!cards?.length) return NextResponse.json({ enriched: 0 });

  let enriched = 0;

  for (const card of cards) {
    try {
      // Text search to find place_id
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(card.title + " Rome Italy")}&key=${apiKey}`,
      );
      const searchData = await searchRes.json() as { results?: { place_id: string }[] };
      const place = searchData.results?.[0];
      if (!place) continue;

      // Fetch full details
      const detailRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,photos&key=${apiKey}`,
      );
      const detailData = await detailRes.json() as {
        result?: {
          formatted_address?: string;
          formatted_phone_number?: string;
          website?: string;
          rating?: number;
          photos?: { photo_reference: string }[];
        };
      };
      const result = detailData.result;
      if (!result) continue;

      // Build photo URL
      const photoRef = result.photos?.[0]?.photo_reference;
      const coverImageUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKey}`
        : null;

      // Update card
      await supabase
        .from("cards")
        .update({
          cover_image_url: coverImageUrl,
          address: result.formatted_address,
          details: {
            website: result.website,
            phone: result.formatted_phone_number,
            rating: result.rating,
            place_id: place.place_id,
          },
        })
        .eq("id", card.id);

      enriched++;
    } catch {
      continue;
    }
  }

  return NextResponse.json({ enriched, total: cards.length });
}
