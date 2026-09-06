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

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "place-photos";
const DAYS = 30;
const MAX_BYTES = 5 * 1024 * 1024;

export interface CachedPhoto {
  url: string;
  until: string;
}

export type PhotoCache = Record<string, CachedPhoto | undefined>;

/** "thumb" is what a card row draws (52–76 px); "full" is the gallery. */
export type PhotoSize = "full" | "thumb";

/** Google's maxwidth for each size. A thumb is ~8 KB against ~190 KB. */
export const PHOTO_WIDTH: Record<PhotoSize, string> = { full: "800", thumb: "320" };

/** Cache key: the bare index for the full image, "t0" for its thumbnail. */
function cacheKey(index: number, size: PhotoSize): string {
  return size === "thumb" ? `t${index}` : String(index);
}

/** The cached URL for this index and size, if stored and inside its 30 days. */
export function cachedPhotoUrl(cache: unknown, index: number, size: PhotoSize = "full"): string | null {
  if (!cache || typeof cache !== "object") return null;
  const entry = (cache as PhotoCache)[cacheKey(index, size)];
  if (!entry?.url || !entry.until) return null;
  return Date.parse(entry.until) > Date.now() ? entry.url : null;
}

/**
 * Copy the image at `sourceUrl` into the bucket and record it on the place.
 * Returns the public URL, or null if anything went wrong — the caller then
 * redirects to Google as before, so a failure here is slow, never broken.
 */
export async function storePhoto(
  placeId: string,
  index: number,
  sourceUrl: string,
  size: PhotoSize = "full",
): Promise<string | null> {
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

    const until = new Date(Date.now() + DAYS * 86400_000).toISOString();
    // Merge into the column rather than replacing it: other indexes of the
    // same gallery may be cached already.
    const { data: row } = await admin.from("places").select("photo_cache").eq("id", placeId).maybeSingle();
    const existing = (row?.photo_cache ?? {}) as PhotoCache;
    const { error: setErr } = await admin
      .from("places")
      .update({ photo_cache: { ...existing, [cacheKey(index, size)]: { url, until } } })
      .eq("id", placeId);
    if (setErr) console.error("[Roam] photo cache write failed:", setErr.message);

    return url;
  } catch (e) {
    console.error("[Roam] photo cache failed:", (e as Error).message);
    return null;
  }
}
