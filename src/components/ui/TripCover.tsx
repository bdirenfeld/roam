"use client";

/**
 * TripCover — shows a real city photo from Unsplash Source,
 * with a dark gradient overlay so text stays readable.
 * Falls back to a deterministic colour gradient if the image fails.
 */

import { useState } from "react";

// 12 hand-picked travel-feeling gradients (fallback only)
const PALETTES = [
  { from: "#0D9488", to: "#0369A1" },
  { from: "#7C3AED", to: "#DB2777" },
  { from: "#B45309", to: "#D97706" },
  { from: "#065F46", to: "#0D9488" },
  { from: "#1D4ED8", to: "#7C3AED" },
  { from: "#9F1239", to: "#C2410C" },
  { from: "#0369A1", to: "#0891B2" },
  { from: "#4F46E5", to: "#0D9488" },
  { from: "#166534", to: "#15803D" },
  { from: "#92400E", to: "#B45309" },
  { from: "#0F172A", to: "#1E3A5F" },
  { from: "#BE185D", to: "#9F1239" },
] as const;

function paletteIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTES.length;
}

/** "Rome, Italy" → "Rome"  |  "New York" → "New York" */
function cityFromDestination(destination: string): string {
  return destination.split(",")[0].trim();
}

interface Props {
  destination: string;
  coverImageUrl?: string | null;
  className?: string;
}

export default function TripCover({ destination, coverImageUrl, className = "" }: Props) {
  const [imgError, setImgError] = useState(false);
  const palette = PALETTES[paletteIndex(destination)];

  // Explicit user-uploaded cover image takes priority
  if (coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImageUrl}
        alt={destination}
        className={`object-cover ${className}`}
      />
    );
  }

  // Unsplash Source photo (free, no API key needed)
  if (!imgError) {
    const city = cityFromDestination(destination);
    const photoUrl = `https://source.unsplash.com/800x400/?${encodeURIComponent(city)},travel`;

    return (
      <div className={`relative overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={destination}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        {/* Dark gradient overlay so card title / dates remain legible */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      </div>
    );
  }

  // Fallback: deterministic colour gradient
  return (
    <div
      className={`flex items-end p-3 ${className}`}
      style={{
        background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
      }}
    >
      <span
        className="text-5xl font-black leading-none select-none"
        style={{ color: "rgba(255,255,255,0.18)" }}
        aria-hidden
      >
        {destination.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}
