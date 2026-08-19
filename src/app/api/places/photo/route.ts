import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_HEADER = "public, max-age=86400, s-maxage=86400";

interface StoredPhoto {
  photo_reference?: string;
}

function notFound() {
  return new NextResponse(null, { status: 404 });
}

function redirectTo(location: string) {
  return new NextResponse(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": CACHE_HEADER },
  });
}

// Google answers a valid photo_reference with a 302 to its image CDN; an
// expired or invalid ref gets a 400/403 with no Location. The status lets the
// caller tell "ref went stale" apart from network failure.
async function resolvePhotoLocation(photoRef: string, apiKey: string) {
  const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
  photoUrl.searchParams.set("photoreference", photoRef);
  photoUrl.searchParams.set("maxwidth", "800");
  photoUrl.searchParams.set("key", apiKey);
  try {
    const res = await fetch(photoUrl.toString(), { redirect: "manual" });
    return { location: res.headers.get("location"), status: res.status };
  } catch {
    return { location: null, status: 0 };
  }
}

// Stored refs expire in bulk — every ref on a place was minted by the same
// enrichment call — so one opened gallery discovers expiry on several photo
// requests at once. Dedupe the refresh per place so a ten-photo gallery costs
// one Place Details call, not ten. Per-instance state, same trade-off as the
// client's photosCache.
const refreshInFlight = new Map<string, Promise<StoredPhoto[] | null>>();

function refreshStoredPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  place: { id: string; google_place_id: string; details: unknown },
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

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const placeId = req.nextUrl.searchParams.get("place_id");
  if (!placeId || !UUID_RE.test(placeId)) return notFound();

  // Optional gallery index into details.photos. Default 0 = the cover,
  // identical to the historical single-photo behavior.
  const indexParam = req.nextUrl.searchParams.get("index");
  const index = indexParam === null ? 0 : Number.parseInt(indexParam, 10);
  if (!Number.isInteger(index) || index < 0) return notFound();

  const { data: place } = await supabase
    .from("places")
    .select("id, google_place_id, cover_image_url, details")
    .eq("id", placeId)
    .maybeSingle();

  if (!place) return notFound();

  if (place.google_place_id) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return notFound();

    // The enriched place_details response is persisted on places.details —
    // read the photo reference from there so a gallery of N photos doesn't
    // cost N live Place Details calls. Out-of-range index falls off the
    // array and 404s, same as a photo-less place.
    const stored = (place.details as { photos?: StoredPhoto[] } | null)?.photos;
    let photoRef: string | undefined;
    // Only a stored ref can be stale; one fetched live this request is fresh,
    // so the expiry retry below applies to the stored path alone.
    let refFromStore = false;

    if (Array.isArray(stored)) {
      photoRef = stored[index]?.photo_reference;
      refFromStore = photoRef !== undefined;
    } else {
      // Pre-enrichment place (no stored details) — live fetch as before.
      const details = await fetchPlaceDetails(place.google_place_id, apiKey);
      if (!details.ok) return notFound();
      const photos = details.result.photos as StoredPhoto[] | undefined;
      photoRef = photos?.[index]?.photo_reference;
    }
    if (!photoRef) return notFound();

    let resolved = await resolvePhotoLocation(photoRef, apiKey);

    // Stored photo references expire some months after the Place Details call
    // that minted them. Refresh the details once, persist the new photos
    // array back to the row, and retry with the fresh ref at the same index.
    // A rate-limited or failed refresh falls through to the 404 — no loop.
    if (
      !resolved.location &&
      refFromStore &&
      (resolved.status === 400 || resolved.status === 403)
    ) {
      const fresh = await refreshStoredPhotos(supabase, place, apiKey);
      const freshRef = fresh?.[index]?.photo_reference;
      if (!freshRef) return notFound();
      resolved = await resolvePhotoLocation(freshRef, apiKey);
    }

    if (!resolved.location) return notFound();
    return redirectTo(resolved.location);
  }

  if (place.cover_image_url) return redirectTo(place.cover_image_url);

  return notFound();
}
