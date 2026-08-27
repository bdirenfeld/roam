"use client";

import { Heart } from "@phosphor-icons/react";

/** The house accent. The heart is burnt sienna, never red — a loved place is a
 *  quiet mark beside a name, not a warning and not a like button. */
export const LOVED_ACCENT = "#C4622D";

/**
 * The single "we loved this" mark, shared by every surface that lists places
 * (agenda card, map sidebar, "Add from saved", global search). One component so
 * the glyph can never drift in size or colour between them.
 *
 * No count, no label, no ring — the signal is that it is there at all.
 */
export default function LovedHeart({ size = 11 }: { size?: number }) {
  return (
    <Heart
      size={size}
      weight="fill"
      color={LOVED_ACCENT}
      aria-label="We loved this"
      className="flex-shrink-0"
    />
  );
}
