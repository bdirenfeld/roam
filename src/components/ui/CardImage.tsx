"use client";

/**
 * CardImage — three-tier fallback chain for card photos.
 *
 * Tier 1  Google Places photo (cover_image_url stored on the card)
 * Tier 2  Mapbox Static API aerial/street view using card coordinates
 * Tier 3  Styled placeholder (warm grey + title initials) — never a broken img
 */

import { useState, useEffect, useRef } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Rome city centre — fallback when a card has no coordinates
const FALLBACK_LAT = 41.9028;
const FALLBACK_LNG = 12.4964;

function mapboxStaticUrl(lng: number, lat: number, zoom: number): string | null {
  if (!MAPBOX_TOKEN) return null;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${lng},${lat},${zoom},0/800x400@2x?access_token=${MAPBOX_TOKEN}`
  );
}

/** Extract up to two initials from a title string. */
function titleInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface Props {
  /** Tier-1 source — Google Places photo URL (may be null/undefined). */
  src?: string | null;
  alt?: string;
  className?: string;
  /** Card coordinates — used to build the Mapbox tier-2 fallback. */
  lat?: number | null;
  lng?: number | null;
  /** sub_type drives zoom: self_directed / wandering → 13, others → 15. */
  subType?: string | null;
  /** Card title — used for initials in the tier-3 placeholder. */
  title?: string;
  /**
   * Fired once when the chain reaches tier 3 — i.e. there is no real photo and
   * no map tile, only the initials placeholder. Callers that would rather show
   * nothing than a grey box (the Plan board's banner) use this to unmount the
   * whole slot. Omit it and the placeholder renders exactly as it always has.
   */
  onUnavailable?: () => void;
}

type Tier = 1 | 2 | 3;

export default function CardImage({
  src,
  alt = "",
  className = "",
  lat,
  lng,
  subType,
  title = "",
  onUnavailable,
}: Props) {
  const [tier, setTier] = useState<Tier>(src ? 1 : 2);

  // Reset tier if the source URL changes (e.g. card re-linked to a new place)
  useEffect(() => {
    setTier(src ? 1 : 2);
  }, [src]);

  const zoom = subType === "self_directed" || subType === "wandering" ? 13 : 15;
  const mapLng = lng ?? FALLBACK_LNG;
  const mapLat = lat ?? FALLBACK_LAT;
  const mapSrc = mapboxStaticUrl(mapLng, mapLat, zoom);

  // Report "no image at all" from an effect, never from render — the caller
  // typically responds by setting state, and doing that during a child's render
  // is a React warning. Held in a ref so a caller passing an inline arrow
  // doesn't re-fire the effect on every render.
  const exhausted = tier === 3 || (tier === 2 && !mapSrc);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;
  useEffect(() => {
    if (exhausted) onUnavailableRef.current?.();
  }, [exhausted]);

  // The board is server-rendered, so these <img> tags exist in the initial HTML
  // and the browser starts fetching them long before React hydrates. An image
  // that FAILS in that window fires its error event with no handler attached
  // yet, and the onError props below never run — leaving the card stranded on a
  // broken tier for the life of the page. A settled-but-zero-sized element is
  // exactly that state, so re-check it the moment the ref lands and fall
  // through by hand. Idempotent: setTier to the value it already holds is a
  // no-op re-render, so the changing ref identity can't loop.
  const settledCheck = (fail: () => void) => (node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) fail();
  };
  const failTier1 = () => setTier(mapSrc ? 2 : 3);
  const failTier2 = () => setTier(3);

  // ── Tier 3 placeholder ────────────────────────────────────────
  const Placeholder = (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ background: "#E8E3DA" }}
    >
      <span className="text-sm font-semibold select-none" style={{ color: "#6B7280" }}>
        {titleInitials(title) || "·"}
      </span>
    </div>
  );

  // A caller that handed us onUnavailable has said it would rather show
  // nothing than the placeholder, so don't paint one on the way out.
  if (exhausted) return onUnavailable ? null : Placeholder;

  if (tier === 2) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={settledCheck(failTier2)}
        src={mapSrc!}
        alt={alt}
        className={className}
        onError={failTier2}
      />
    );
  }

  // tier === 1 — Google Places photo
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={settledCheck(failTier1)}
      src={src!}
      alt={alt}
      className={className}
      onError={failTier1}
    />
  );
}
