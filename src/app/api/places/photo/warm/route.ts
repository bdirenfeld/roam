// POST /api/places/photo/warm  { place_id }
//
// The first time a card's gallery opens, copy all of the place's photos into
// the `place-photos` bucket at once and hand the gallery their URLs, so every
// swipe after the cover is a plain image from our own storage — no redirect
// through this app, no Google round trip, no upload in the way (5 Oct 2026,
// speed: "swiping is instant from the first photo").
//
// Spending guards, in order:
//   1. signed in (RLS also limits the row to places this user can see);
//   2. cache-first — only photos without a live copy are fetched;
//   3. at most once per place per 30 days — the `warmed` marker is written
//      with the copies, and a place carrying it is answered from the column;
//   4. one in-flight warm per place per instance;
//   5. each Google fetch counts against the `placePhoto` daily quota.
// The cover (index 0) is left to /api/places/photo, which the card requests
// the moment it opens; copying it here too would pay Google twice.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, QUOTA } from "@/lib/api/guard";
import { recordPhotos, uploadPhoto } from "@/lib/places/photoCache";
import {
  galleryUrls,
  indexesToWarm,
  MAX_GALLERY,
  WARM_KEY,
  warmMarker,
  type PhotoCache,
} from "@/lib/places/photoWarm";
import { refWentStale, refreshStoredPhotos, resolvePhotoLocation, type StoredPhoto } from "../google";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inFlight = new Map<string, Promise<(string | null)[]>>();

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase } = gate;

  const body = (await req.json().catch(() => null)) as { place_id?: unknown } | null;
  const placeId = typeof body?.place_id === "string" ? body.place_id : "";
  if (!UUID_RE.test(placeId)) return NextResponse.json({ error: "Bad place" }, { status: 400 });

  const { data: place } = await supabase
    .from("places")
    .select("id, google_place_id, details, photo_cache")
    .eq("id", placeId)
    .maybeSingle();
  if (!place) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stored = (place.details as { photos?: StoredPhoto[] } | null)?.photos;
  const count = Array.isArray(stored) ? Math.min(stored.length, MAX_GALLERY) : 0;
  const todo = indexesToWarm(place.photo_cache, count);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (todo.length === 0 || !place.google_place_id || !apiKey || !Array.isArray(stored)) {
    return NextResponse.json({ urls: galleryUrls(place.photo_cache, count) });
  }

  let job = inFlight.get(placeId);
  if (!job) {
    job = (async () => {
      let refs: StoredPhoto[] = stored;
      let refreshed = false;

      const copyOne = async (index: number) => {
        if (!(await underQuota(supabase, "placePhoto", QUOTA.placePhoto))) return null;
        const ref = refs[index]?.photo_reference;
        if (!ref) return null;
        let resolved = await resolvePhotoLocation(ref, apiKey, "full");
        // Stored refs expire together; the shared refresh costs one Place
        // Details call for the whole gallery, then each index retries once.
        if (!resolved.location && !refreshed && refWentStale(resolved.status)) {
          const fresh = await refreshStoredPhotos(supabase, place, apiKey);
          if (fresh) { refs = fresh; refreshed = true; }
          const freshRef = fresh?.[index]?.photo_reference;
          if (freshRef) resolved = await resolvePhotoLocation(freshRef, apiKey, "full");
        }
        if (!resolved.location) return null;
        return uploadPhoto(placeId, index, resolved.location, "full");
      };

      const copies = await Promise.all(todo.map(copyOne));
      const entries: PhotoCache = { [WARM_KEY]: warmMarker() };
      for (const c of copies) if (c) entries[c.key] = c.entry;
      // One write for the whole gallery, merged with whatever the cover
      // request stored meanwhile.
      const merged = await recordPhotos(placeId, entries);
      return galleryUrls(merged ?? { ...((place.photo_cache as PhotoCache) ?? {}), ...entries }, count);
    })();
    inFlight.set(placeId, job);
    job.finally(() => inFlight.delete(placeId)).catch(() => {});
  }

  try {
    return NextResponse.json({ urls: await job });
  } catch (e) {
    console.error("[Roam] photo warm failed:", (e as Error).message);
    return NextResponse.json({ urls: galleryUrls(place.photo_cache, count) });
  }
}
