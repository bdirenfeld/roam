/**
 * Server-only: fetch a destination photo from Unsplash and store it on the trip.
 * Returns the URL on success, null on any failure.
 *
 * Import this file only from server components and API routes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchDestinationPhoto(destination: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  try {
    const query = encodeURIComponent(`${destination} travel landmark`);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${key}` },
        next: { revalidate: 0 },
      },
    );
    if (!res.ok) return null;
    const data = await res.json() as { results?: { urls?: { regular?: string } }[] };
    return data.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a photo for a trip and persist it to the trips table.
 * Safe to call concurrently. Silently no-ops if the key is missing.
 */
export async function fetchAndStoreCover(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  tripId: string,
  destination: string,
): Promise<string | null> {
  const url = await fetchDestinationPhoto(destination);
  if (!url) return null;

  await supabase
    .from("trips")
    .update({ cover_image_url: url })
    .eq("id", tripId);

  return url;
}
