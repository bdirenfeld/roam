"use client";

import { useEffect } from "react";

/**
 * Escape closes the thing.
 *
 * Eight overlays had no keyboard exit at all — two of them delete confirms,
 * so a keyboard user could open "Delete permanently" and not get out (UX
 * audit, Sep 2026, finding 5). ShareJourneySheet and friends each carried a
 * private copy of this effect; this is that effect, once.
 *
 * `active` lets a host that renders conditionally (a confirm that is only
 * sometimes open) keep the hook call unconditional.
 */
export function useEscapeKey(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, active]);
}
