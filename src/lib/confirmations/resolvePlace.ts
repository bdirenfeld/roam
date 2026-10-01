import type { Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { placeQuery, placeSubType, type ParsedConfirmation } from "./toCards";

/**
 * The real place behind a booking (1 Oct 2026): looked up on Google by the
 * hotel's name and address, the flight's airport or the car's pick-up desk,
 * and saved the way the map saves one, so the card has a pin, photos and an
 * address, and a hotel counts as where you sleep. Any failure leaves the card
 * as a plain note, as before — the booking is never lost to a lookup.
 * Thin wrapper over two routes; the decisions are tested in ./toCards.
 */
export async function resolvePlace(p: ParsedConfirmation): Promise<Place | null> {
  const q = placeQuery(p);
  if (!q) return null;
  try {
    const ac = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(q)}`).then((r) => r.json()) as { predictions?: { place_id: string }[] };
    const gid = ac.predictions?.[0]?.place_id;
    if (!gid) return null;
    const imp = await fetch("/api/places/bulk-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ google_place_ids: [gid], defaults: placeSubType(p.type) }) })
      .then((r) => r.json()) as { imported?: { place_id: string }[] };
    const id = imp.imported?.[0]?.place_id;
    if (!id) return null;
    const { data } = await createClient().from("places").select("id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level").eq("id", id).maybeSingle();
    return (data as Place | null) ?? null;
  } catch {
    return null;
  }
}
