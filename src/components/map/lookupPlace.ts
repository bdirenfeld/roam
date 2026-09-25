/**
 * Look a Google place up for the add-a-place sheet: details, a cover photo
 * through the proxy, today's hours. Shared by the Map tab and the week's map
 * (24 Sep 2026) so both drop the same PlaceResult into AddToTripSheet.
 */
import type { PlaceResult } from "./AddToTripSheet";

export async function lookupPlace(placeId: string, sessionToken: string): Promise<PlaceResult | null> {
  try {
    const res  = await fetch(
      `/api/places/details?place_id=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
    );
    const data = await res.json();
    if (!data.result) return null;
    const { result } = data;
    const lat = result.geometry.location.lat as number;
    const lng = result.geometry.location.lng as number;

    // Resolve cover photo via server-side proxy
    let coverPhotoUrl: string | undefined;
    const photoRef = result.photos?.[0]?.photo_reference as string | undefined;
    if (photoRef) {
      try {
        const photoRes  = await fetch(`/api/places/photo/by-reference?photo_reference=${encodeURIComponent(photoRef)}&maxwidth=800`);
        const photoData = await photoRes.json();
        if (photoData.url) coverPhotoUrl = photoData.url as string;
      } catch {
        // best-effort
      }
    }

    // Parse today's opening hours
    let openNow: boolean | undefined;
    let todayHours: string | undefined;
    if (result.opening_hours) {
      openNow = result.opening_hours.open_now as boolean | undefined;
      const weekdayText = result.opening_hours.weekday_text as string[] | undefined;
      if (weekdayText?.length) {
        const jsDay = new Date().getDay();
        const idx   = jsDay === 0 ? 6 : jsDay - 1;
        const raw   = weekdayText[idx] ?? "";
        const sep   = raw.indexOf(": ");
        todayHours  = sep !== -1 ? raw.slice(sep + 2) : raw;
      }
    }

    return {
      placeId,
      name:             result.name,
      address:          result.formatted_address ?? "",
      lat, lng,
      website:          result.website,
      mapsUrl:          result.url,
      coverPhotoUrl,
      rating:           result.rating,
      userRatingsTotal: result.user_ratings_total,
      phone:            result.formatted_phone_number,
      openNow,
      todayHours,
      // Forward the raw opening_hours object and the full raw details result
      // so AddToTripSheet can persist them onto the places row (world facts).
      hours:            result.opening_hours ?? null,
      details:          result,
    };
  } catch {
    return null;
  }
}

/** The purple dot that marks a found place until the sheet closes. */
export const TEMP_PIN_SVG =
  `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">` +
  `<circle cx="14" cy="14" r="12" fill="#7C3AED"/>` +
  `<circle cx="14" cy="14" r="4" fill="white"/>` +
  `</svg>`;
