import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedPlace } from "@/lib/places/predictions";

/**
 * Save a resolved place onto a journey as an unscheduled pin.
 *
 * This is the second thing an idea can become. A destination answers "where
 * should we go, and when"; a pin answers "what do we do once we're there" —
 * and it is why one Reddit thread of fifteen restaurants can't be a single
 * wishlist row.
 *
 * Nothing new is invented here: a card with `day_id: null` and status
 * "interested" is exactly what the Plan board's lists and "Add from saved"
 * already read, so a pin added this way is indistinguishable from one added
 * on the map.
 */

/** Google's categories, narrowed to Roam's taxonomy. Anything unrecognised is
 *  a self-directed activity — the neutral option, changed in a tap if wrong.
 *  Guessing beats asking here: the sheet is already three steps deep. */
function classify(types: string[]): { type: string; sub_type: string } {
  const has = (t: string) => types.includes(t);
  if (has("restaurant") || has("meal_takeaway") || has("meal_delivery")) {
    return { type: "food", sub_type: "restaurant" };
  }
  if (has("cafe") || has("bakery") || has("ice_cream_shop")) {
    return { type: "food", sub_type: "coffee_dessert" };
  }
  if (has("bar") || has("night_club")) return { type: "food", sub_type: "drinks" };
  if (has("lodging")) return { type: "logistics", sub_type: "accommodation" };
  if (has("spa")) return { type: "activity", sub_type: "wellness" };
  return { type: "activity", sub_type: "self_directed" };
}

export type PinResult =
  | { ok: true; duplicate: false; placeName: string }
  | { ok: true; duplicate: true; placeName: string }
  | { ok: false; message: string };

export async function pinPlaceToJourney(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  place: ResolvedPlace,
  /** The link the idea came from. Stored on the card so tapping the pin on the
   *  map leads back to the reel or thread you saved it from — remembering why
   *  a place is on the list is most of what an idea is for. */
  sourceUrl?: string | null
): Promise<PinResult> {
  // World facts live on `places`, keyed by Google's id — upsert so saving the
  // same spot from two ideas doesn't fork the record.
  const { type, sub_type } = classify(place.types);
  const { data: placeRow, error: placeErr } = await supabase
    .from("places")
    .upsert(
      {
        user_id: userId,
        google_place_id: place.placeId,
        title: place.name,
        type,
        sub_type,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
      },
      { onConflict: "user_id,google_place_id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (placeErr || !placeRow) {
    return { ok: false, message: "Couldn't save that place. Try again." };
  }

  // Already pinned to this journey? Say so rather than quietly making a second
  // copy — the same courtesy the wishlist duplicate check gives.
  const { data: existing } = await supabase
    .from("cards")
    .select("id")
    .eq("trip_id", tripId)
    .eq("place_id", placeRow.id)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, duplicate: true, placeName: place.name };
  }

  const { error: cardErr } = await supabase.from("cards").insert({
    day_id: null,
    trip_id: tripId,
    start_time: null,
    end_time: null,
    position: 0,
    status: "interested",
    place_id: placeRow.id,
    source_url: sourceUrl ?? null,
    details: null,
  });

  if (cardErr) {
    return { ok: false, message: "Couldn't add it to the journey. Try again." };
  }
  return { ok: true, duplicate: false, placeName: place.name };
}
