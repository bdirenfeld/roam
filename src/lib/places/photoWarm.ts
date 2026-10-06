// ── Which of a place's photos are already ours, and which to copy ──────────
// Pure rules shared by the gallery (browser) and the photo routes (server).
// No Supabase import here: the gallery is a client component and must not
// pull the admin client in with it.
//
// `places.photo_cache` is a JSON object: "0".."9" for the full-size copies,
// "t0".. for thumbnails, each { url, until }. Thirty days, then the copy
// lapses and Google is asked again — a Google Maps terms requirement, never
// make it permanent (see photoCache.ts).
//
// "Warm" (5 Oct 2026, speed): the first time a card's gallery opens, the
// server copies every photo the place has into the bucket in one go, so the
// first swipe is a plain image from our storage instead of a redirect chain
// through Google. The `warmed` marker makes that at most once per place per
// thirty days, whoever opens it and however often.

export interface CachedPhoto {
  url: string;
  until: string;
}

export type PhotoCache = Record<string, CachedPhoto | undefined>;

/** "thumb" is what a card row draws (52–76 px); "full" is the gallery. */
export type PhotoSize = "full" | "thumb";

/** Marker entry: the place's gallery was copied in; don't ask again until `until`. */
export const WARM_KEY = "warmed";

/** How long a copy (and the warm marker) lives. Google terms: temporary only. */
export const CACHE_DAYS = 30;

/** Google never returns more than ten photos for a place; never copy more. */
export const MAX_GALLERY = 10;

/** Cache key: the bare index for the full image, "t0" for its thumbnail. */
export function photoCacheKey(index: number, size: PhotoSize = "full"): string {
  return size === "thumb" ? `t${index}` : String(index);
}

function asCache(cache: unknown): PhotoCache | null {
  return cache && typeof cache === "object" && !Array.isArray(cache) ? (cache as PhotoCache) : null;
}

/** The URL stored under `key`, if there is one and it is inside its 30 days. */
export function liveCachedUrl(cache: unknown, key: string, now: number = Date.now()): string | null {
  const entry = asCache(cache)?.[key];
  if (!entry?.url || !entry.until) return null;
  return Date.parse(entry.until) > now ? entry.url : null;
}

/** Full-size URL for every gallery slide: our copy, or null where there isn't one. */
export function galleryUrls(cache: unknown, count: number, now: number = Date.now()): (string | null)[] {
  const n = Math.max(0, Math.min(count, MAX_GALLERY));
  return Array.from({ length: n }, (_, i) => liveCachedUrl(cache, photoCacheKey(i), now));
}

/**
 * Which full-size photos the warm route should copy. Index 0 is never in the
 * list: the cover is requested by the card the moment it opens, through
 * /api/places/photo, which stores it itself — copying it here as well would
 * pay Google twice for the same photo. Empty once the place has been warmed
 * inside its 30 days, so a photo Google refuses is not retried on every open.
 */
export function indexesToWarm(cache: unknown, count: number, now: number = Date.now()): number[] {
  const c = asCache(cache);
  const marker = c?.[WARM_KEY];
  if (marker?.until && Date.parse(marker.until) > now) return [];
  return galleryUrls(cache, count, now)
    .map((url, i) => (url === null && i > 0 ? i : -1))
    .filter((i) => i > 0);
}

/** The warm marker to record alongside the copies. */
export function warmMarker(now: number = Date.now()): CachedPhoto {
  return { url: "", until: new Date(now + CACHE_DAYS * 86400_000).toISOString() };
}

/**
 * `existing` with `entries` written over it. Keeps every key it doesn't
 * touch: other slides of the same gallery are stored by other requests.
 */
export function mergePhotoCache(existing: unknown, entries: PhotoCache): PhotoCache {
  return { ...(asCache(existing) ?? {}), ...entries };
}
