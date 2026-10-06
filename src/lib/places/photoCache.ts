// ── Cached place photos ───────────────────────────────────────────────────
// Every card with a photo used to cost a Google Places Photo call per viewer
// per day: the single biggest bill at any scale (scale audit, Sept 2026).
// The first viewer now copies the image into the public `place-photos`
// bucket and every later request is served from there.
//
// Thirty days, not forever: the Google Maps Platform terms allow temporary
// caching of their content for performance, and place IDs indefinitely, but
// not permanent copies of photos. `until` is checked on every read and the
// image is refetched when it lapses.
//
// The pure rules (keys, expiry, merge) live in photoWarm.ts so the gallery
// can read the same column in the browser.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  CACHE_DAYS,
  liveCachedUrl,
  mergePhotoCache,
  photoCacheKey,
  type CachedPhoto,
  type PhotoCache,
  type PhotoSize,
} from "./photoWarm";

export type { CachedPhoto, PhotoCache, PhotoSize };

const BUCKET = "place-photos";
const MAX_BYTES = 5 * 1024 * 1024;

/** Google's maxwidth for each size. A thumb is ~8 KB against ~190 KB. */
export const PHOTO_WIDTH: Record<PhotoSize, string> = { full: "800", thumb: "320" };

/** The cached URL for this index and size, if stored and inside its 30 days. */
export function cachedPhotoUrl(cache: unknown, index: number, size: PhotoSize = "full"): string | null {
  return liveCachedUrl(cache, photoCacheKey(index, size));
}

/**
 * Copy the image at `sourceUrl` into the bucket. Returns the cache entry to
 * record, or null if anything went wrong. Does not touch `photo_cache`: the
 * warm route uploads a whole gallery and records it in one write.
 */
export async function uploadPhoto(
  placeId: string,
  index: number,
  sourceUrl: string,
  size: PhotoSize = "full",
): Promise<{ key: string; entry: CachedPhoto } | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${placeId}/${index}${size === "thumb" ? "-thumb" : ""}.${ext}`;
    const admin = createAdminClient();

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: type,
      upsert: true,
      cacheControl: "2592000", // 30 days, matching `until`
    });
    if (upErr) {
      console.error("[Roam] photo cache upload failed:", upErr.message);
      return null;
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl;
    if (!url) return null;

    const until = new Date(Date.now() + CACHE_DAYS * 86400_000).toISOString();
    return { key: photoCacheKey(index, size), entry: { url, until } };
  } catch (e) {
    console.error("[Roam] photo cache failed:", (e as Error).message);
    return null;
  }
}

/**
 * Merge `entries` into the place's `photo_cache`, as a compare-and-swap.
 *
 * This used to be read, merge, write. A gallery opening asks for three photos
 * at once, each request read the same old column and the last write won: on
 * 5 Oct 2026 the bucket held 35 copies (32 places) that `photo_cache` had
 * forgotten, and every one of them was paid for again on the next open. The
 * update now only lands if the column still holds what was read; otherwise it
 * re-reads and tries again. PostgREST compares jsonb by value, not text.
 * Returns the merged column, or null if it could not be written.
 */
export async function recordPhotos(placeId: string, entries: PhotoCache): Promise<PhotoCache | null> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readErr } = await admin
      .from("places")
      .select("photo_cache")
      .eq("id", placeId)
      .maybeSingle();
    if (readErr || !row) {
      if (readErr) console.error("[Roam] photo cache read failed:", readErr.message);
      return null;
    }
    const merged = mergePhotoCache(row.photo_cache, entries);
    const update = admin.from("places").update({ photo_cache: merged }).eq("id", placeId);
    const guarded =
      row.photo_cache == null
        ? update.is("photo_cache", null)
        : update.eq("photo_cache", JSON.stringify(row.photo_cache));
    const { data: written, error: setErr } = await guarded.select("id");
    if (setErr) {
      console.error("[Roam] photo cache write failed:", setErr.message);
      return null;
    }
    if (written && written.length > 0) return merged;
    // Someone else wrote between our read and write — go round again.
  }
  console.error("[Roam] photo cache write kept colliding:", placeId);
  return null;
}

/**
 * Copy one image into the bucket and record it on the place. Returns the
 * public URL, or null if anything went wrong — the caller then redirects to
 * Google as before, so a failure here is slow, never broken.
 */
export async function storePhoto(
  placeId: string,
  index: number,
  sourceUrl: string,
  size: PhotoSize = "full",
): Promise<string | null> {
  const up = await uploadPhoto(placeId, index, sourceUrl, size);
  if (!up) return null;
  // A failed record still serves this request from the copy just uploaded.
  await recordPhotos(placeId, { [up.key]: up.entry });
  return up.entry.url;
}
