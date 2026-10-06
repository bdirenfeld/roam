// Google Places photo helpers shared by /api/places/photo (one photo) and
// /api/places/photo/warm (a whole gallery). Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";
import { PHOTO_WIDTH, type PhotoSize } from "@/lib/places/photoCache";

export interface StoredPhoto {
  photo_reference?: string;
}

export interface PlaceForPhotos {
  id: string;
  google_place_id: string;
  details: unknown;
}

// Google answers a valid photo_reference with a 302 to its image CDN; an
// expired or invalid ref gets a 400/403 with no Location. The status lets the
// caller tell "ref went stale" apart from network failure.
export async function resolvePhotoLocation(photoRef: string, apiKey: string, size: PhotoSize = "full") {
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("photoreference", photoRef);
  photoUrl.searchParams.set("maxwidth", PHOTO_WIDTH[size]);
  photoUrl.searchParams.set("key", apiKey);
  try {
    const res = await fetch(photoUrl.toString(), { redirect: "manual" });
    return { location: res.headers.get("location"), status: res.status };
  } catch {
    return { location: null, status: 0 };
  }
}

/** True when Google refused a ref as stale — the cue to refresh details once. */
export function refWentStale(status: number): boolean {
  return status === 400 || status === 403;
}

// Stored refs expire in bulk — every ref on a place was minted by the same
// enrichment call — so one opened gallery discovers expiry on several photo
// requests at once. Dedupe the refresh per place so a ten-photo gallery costs
// one Place Details call, not ten. Per-instance state, same trade-off as the
// client's photosCache.
const refreshInFlight = new Map<string, Promise<StoredPhoto[] | null>>();

export function refreshStoredPhotos(
  supabase: SupabaseClient,
  place: PlaceForPhotos,
  apiKey: string,
): Promise<StoredPhoto[] | null> {
  const inFlight = refreshInFlight.get(place.id);
  if (inFlight) return inFlight;

  const refresh = (async () => {
    const details = await fetchPlaceDetails(place.google_place_id, apiKey);
    if (!details.ok) return null;
    const photos = Array.isArray(details.result.photos)
      ? (details.result.photos as StoredPhoto[])
      : [];
    // Merge rather than replace: enrichment may have persisted fields this
    // route's details fetch doesn't request. Persisting an empty array is
    // deliberate — it stops a photo-less place from re-fetching on every load.
    const existing =
      typeof place.details === "object" && place.details !== null ? place.details : {};
    const { error } = await supabase
      .from("places")
      .update({ details: { ...existing, photos } })
      .eq("id", place.id);
    // A failed write still serves this request from the fresh refs; the row
    // just stays stale and the next session pays the refresh again.
    if (error) console.error("Failed to persist refreshed place photos", error.message);
    return photos;
  })();

  refreshInFlight.set(place.id, refresh);
  refresh.finally(() => refreshInFlight.delete(place.id));
  return refresh;
}
