import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/authUser";
import { createClient } from "@/lib/supabase/server";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";
import { cachedPhotoUrl, storePhoto, type PhotoSize } from "@/lib/places/photoCache";
import { refWentStale, refreshStoredPhotos, resolvePhotoLocation, type StoredPhoto } from "./google";
import { underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_HEADER = "public, max-age=86400, s-maxage=86400";
// A copy in our own bucket is stable for its whole life, so the browser may
// keep it far longer than a Google CDN link.
const CACHED_HEADER = "public, max-age=2592000, s-maxage=2592000, immutable";

function notFound() {
  return new NextResponse(null, { status: 404 });
}

function redirectTo(location: string, header = CACHE_HEADER) {
  return new NextResponse(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": header },
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return new NextResponse(null, { status: 401 });

  const placeId = req.nextUrl.searchParams.get("place_id");
  if (!placeId || !UUID_RE.test(placeId)) return notFound();

  // Optional gallery index into details.photos. Default 0 = the cover,
  // identical to the historical single-photo behavior.
  // A card row asks for "thumb"; the gallery and the card sheet take the full
  // image. Anything else is treated as full.
  const size: PhotoSize = req.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";

  const indexParam = req.nextUrl.searchParams.get("index");
  const index = indexParam === null ? 0 : Number.parseInt(indexParam, 10);
  if (!Number.isInteger(index) || index < 0) return notFound();

  const { data: place } = await supabase
    .from("places")
    .select("id, google_place_id, cover_image_url, details, photo_cache")
    .eq("id", placeId)
    .maybeSingle();

  if (!place) return notFound();

  // The cached copy: no Google call, nothing counted against the day's
  // allowance, and the browser may hold it for a month.
  const cached = cachedPhotoUrl(place.photo_cache, index, size);
  if (cached) return redirectTo(cached, CACHED_HEADER);

  if (place.google_place_id) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return notFound();
    // Counted here, past the cache: a viewer scrolling a cached journey
    // spends nothing.
    if (!(await underQuota(supabase, "placePhoto", QUOTA.placePhoto))) return quotaExceeded("photos");

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

    let resolved = await resolvePhotoLocation(photoRef, apiKey, size);

    // Stored photo references expire some months after the Place Details call
    // that minted them. Refresh the details once, persist the new photos
    // array back to the row, and retry with the fresh ref at the same index.
    // A rate-limited or failed refresh falls through to the 404 — no loop.
    if (
      !resolved.location &&
      refFromStore &&
      refWentStale(resolved.status)
    ) {
      const fresh = await refreshStoredPhotos(supabase, place, apiKey);
      const freshRef = fresh?.[index]?.photo_reference;
      if (!freshRef) return notFound();
      resolved = await resolvePhotoLocation(freshRef, apiKey, size);
    }

    if (!resolved.location) return notFound();

    // Copy it into the bucket for the next viewer. A failure here just means
    // the browser goes to Google this time, as it always did.
    const copied = await storePhoto(place.id, index, resolved.location, size);
    if (copied) return redirectTo(copied, CACHED_HEADER);
    return redirectTo(resolved.location);
  }

  if (place.cover_image_url) return redirectTo(place.cover_image_url);

  return notFound();
}
