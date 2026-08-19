import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_HEADER = "public, max-age=86400, s-maxage=86400";

function notFound() {
  return new NextResponse(null, { status: 404 });
}

function redirectTo(location: string) {
  return new NextResponse(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": CACHE_HEADER },
  });
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
    const stored = (place.details as { photos?: { photo_reference?: string }[] } | null)?.photos;
    let photoRef = Array.isArray(stored) ? stored[index]?.photo_reference : undefined;

    if (!photoRef && !Array.isArray(stored)) {
      // Pre-enrichment place (no stored details) — live fetch as before.
      const details = await fetchPlaceDetails(place.google_place_id, apiKey);
      if (!details.ok) return notFound();
      const photos = details.result.photos as { photo_reference?: string }[] | undefined;
      photoRef = photos?.[index]?.photo_reference;
    }
    if (!photoRef) return notFound();

    const photoUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
    photoUrl.searchParams.set("photoreference", photoRef);
    photoUrl.searchParams.set("maxwidth", "800");
    photoUrl.searchParams.set("key", apiKey);

    let location: string | null = null;
    try {
      const res = await fetch(photoUrl.toString(), { redirect: "manual" });
      location = res.headers.get("location");
    } catch {
      return notFound();
    }
    if (!location) return notFound();

    return redirectTo(location);
  }

  if (place.cover_image_url) return redirectTo(place.cover_image_url);

  return notFound();
}
