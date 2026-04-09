"use client";

/**
 * CardImage — three-tier fallback chain for card photos.
 *
 * Tier 1  Google Places photo (cover_image_url stored on the card)
 * Tier 2  Mapbox Static API aerial/street view using card coordinates
 * Tier 3  Styled placeholder (warm grey + title initials) — never a broken img
 */

import { useState, useEffect } from "react";

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

  if (tier === 3 || (tier === 2 && !mapSrc)) return Placeholder;

  if (tier === 2) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mapSrc!}
        alt={alt}
        className={className}
        onError={() => setTier(3)}
      />
    );
  }

  // tier === 1 — Google Places photo
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt={alt}
      className={className}
      onError={() => setTier(mapSrc ? 2 : 3)}
    />
  );
}
