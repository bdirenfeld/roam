"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Shape of one entry in places.details.photos (raw Google place_details). */
interface PlacePhoto {
  html_attributions?: string[];
}

// Fetched once per place and kept for the session — survives sheet close/reopen
// and router.push() navigations without a provider (same pattern as trip weather).
// Fails silently: the gallery degrades to the single cover it renders today.
const photosCache = new Map<string, PlacePhoto[]>();

interface Props {
  /** places.id (uuid) — the only identifier the client ever sends for photos. */
  placeId: string;
  /** Whether the place is Google-enriched; skips the photo-count fetch when not. */
  hasGooglePhotos: boolean;
  fallbackLat: number | null;
  fallbackLng: number | null;
  title: string;
  height?: number;
}

function mapboxFallbackUrl(lat: number | null, lng: number | null): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const la = lat ?? 41.9028;
  const ln = lng ?? 12.4964;
  const zoom = lat != null ? 15 : 13;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${ln},${la},${zoom},0/800x400@2x?access_token=${token}`;
}

/**
 * Swipeable photo hero for the card bottom sheet, driven by details.photos on
 * the place row. Native CSS scroll-snap — no carousel dependency. Images load
 * lazily (visible + one ahead) through the server-side photo proxy, so opening
 * a card never fires all ten Google photo requests at once.
 * Zero or one photo → a single static cover, exactly as before.
 */
export default function PlacePhotoGallery({
  placeId,
  hasGooglePhotos,
  fallbackLat,
  fallbackLng,
  title,
  height = 220,
}: Props) {
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(
    () => (hasGooglePhotos ? photosCache.get(placeId) ?? null : [])
  );
  const [activeIndex, setActiveIndex] = useState(0);
  // Highest index allowed to render a real <img>: active slide + one ahead.
  // Monotonic — already-loaded slides stay loaded.
  const [eagerUpTo, setEagerUpTo] = useState(1);
  const [coverFailed, setCoverFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasGooglePhotos || photosCache.has(placeId)) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("places")
      .select("photos:details->photos")
      .eq("id", placeId)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (error) {
            console.error("Failed to load place photos", error.message);
            return; // stay on the single cover
          }
          const list = Array.isArray(data?.photos) ? (data.photos as PlacePhoto[]) : [];
          photosCache.set(placeId, list);
          if (!cancelled) setPhotos(list);
        },
        (err: unknown) => console.error("Failed to load place photos", err),
      );
    return () => { cancelled = true; };
  }, [placeId, hasGooglePhotos]);

  const count = photos?.length ?? null;
  const srcFor = (i: number) => `/api/places/photo?place_id=${placeId}&index=${i}`;

  // ── Single cover — photo-less, un-enriched, or count still unknown ──
  if (count === null || count <= 1) {
    const fallback = mapboxFallbackUrl(fallbackLat, fallbackLng);
    const src = coverFailed ? fallback : srcFor(0);
    return (
      <div style={{ height }} className="w-full bg-gray-100 flex-shrink-0">
        {src && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={title}
            className="w-full h-full object-cover"
            onError={() => setCoverFailed(true)}
          />
        )}
      </div>
    );
  }

  // ── Swipeable gallery ──
  const attribution = photos?.[activeIndex]?.html_attributions?.[0] ?? null;

  // Buttons and arrow keys drive the *existing* scroll-snap container rather
  // than a transform carousel, so pointer, keyboard and native swipe all move
  // the same element and stay in sync. activeIndex is owned by onScroll alone:
  // a smooth scroll the browser cancels (e.g. the map pin popup reflowing
  // during a fly-to animation) then leaves counter and strip consistent
  // instead of desynced. eagerUpTo still advances optimistically, preserving
  // the visible + 1 load contract for every input.
  const currentSlide = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return activeIndex;
    return Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (target: number) => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.max(0, Math.min(count - 1, target));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setEagerUpTo((n) => Math.max(n, next + 1));
  };

  // Controls must paint above CardBottomSheet's gradient overlay (z 20) and
  // drag handle (z 21), and a tap on one must not arm the sheet's
  // drag-to-dismiss — hence the touchstart stop on every control.
  const controlZ = { zIndex: 22 };
  const swallowTouch = (e: React.TouchEvent) => e.stopPropagation();

  return (
    <div className="relative w-full flex-shrink-0" style={{ height }}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={`${title} photos`}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el || el.clientWidth === 0) return;
          const idx = Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth));
          setActiveIndex(idx);
          setEagerUpTo((n) => Math.max(n, idx + 1));
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault(); // native arrow scroll nudges by pixels, not by slide
          goTo(currentSlide() + (e.key === "ArrowRight" ? 1 : -1));
        }}
        className="flex h-full overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [&::-webkit-scrollbar]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
        style={{ scrollbarWidth: "none" }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 snap-start bg-gray-100">
            {i <= eagerUpTo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={srcFor(i)}
                alt={`${title} — photo ${i + 1} of ${count}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {/* Google photographer credit for the photo in view */}
      {attribution && (
        <div
          className="absolute bottom-2 left-2 z-10 max-w-[35%] truncate text-[9px] leading-none text-white/70 [&_a]:text-white/70 [&_a]:no-underline"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
          dangerouslySetInnerHTML={{ __html: attribution }}
        />
      )}

      {/* Position indicator — "2/10" */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="absolute bottom-2 right-2 z-10 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {activeIndex + 1}/{count}
      </div>

      {/* Dot indicators — the wrapper is click-through so it never eats a swipe */}
      <div
        className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 pointer-events-none"
        style={controlZ}
      >
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            onTouchStart={swallowTouch}
            aria-label={`Photo ${i + 1}`}
            aria-current={i === activeIndex}
            className={`pointer-events-auto rounded-full transition-all ${
              i === activeIndex ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"
            }`}
          />
        ))}
      </div>

      {/* Prev arrow */}
      {activeIndex > 0 && (
        <button
          type="button"
          onClick={() => goTo(currentSlide() - 1)}
          onTouchStart={swallowTouch}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center"
          style={controlZ}
        >
          <svg width="12" height="12" viewBox="0 0 256 256" fill="white">
            <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
          </svg>
        </button>
      )}

      {/* Next arrow */}
      {activeIndex < count - 1 && (
        <button
          type="button"
          onClick={() => goTo(currentSlide() + 1)}
          onTouchStart={swallowTouch}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center"
          style={controlZ}
        >
          <svg width="12" height="12" viewBox="0 0 256 256" fill="white">
            <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
