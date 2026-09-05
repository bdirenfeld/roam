"use client";

// ── The one phone header for Agenda, Plan and Map ─────────────────────────
// Back on the left, an italic title with a small line under it, search and
// the menu on the right, 44-pixel taps throughout. The Agenda drew this bar
// first; Plan and Map wore their own chrome (round grey buttons, white discs
// on the map) until the consistency sweep (Brennan, Sep 2026: one look).
// The Agenda keeps its own copy because its subtitle is the weather.

import Link from "next/link";
import type { ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

export const HEADER_GLYPH =
  "flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors";

export default function JourneyHeader({
  backHref,
  title,
  subtitle,
  onSearch,
  menu,
  /** Over a full-bleed surface (the map): pinned to the top instead of in flow. */
  absolute = false,
}: {
  backHref: string;
  title: string;
  subtitle?: ReactNode;
  onSearch?: () => void;
  menu?: ReactNode;
  absolute?: boolean;
}) {
  return (
    <div
      className={`${absolute ? "absolute top-0 left-0 right-0 z-30" : "sticky top-0 z-30 relative"} flex items-center bg-white border-b border-gray-100 flex-shrink-0 h-[58px] md:hidden`}
    >
      <Link href={backHref} className={`${HEADER_GLYPH} flex-shrink-0`} aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </Link>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2px] pointer-events-none px-14">
        <span className="font-display italic text-gray-900 text-[19px] leading-none truncate max-w-full">{title}</span>
        {subtitle && (
          <span className="font-display italic text-[11.5px] leading-none truncate max-w-full" style={{ color: "rgba(26,26,46,0.62)" }}>
            {subtitle}
          </span>
        )}
      </div>
      <span className="flex-1" />
      {onSearch && (
        <button type="button" onClick={onSearch} aria-label="Search" className={HEADER_GLYPH}>
          <MagnifyingGlass size={19} weight="light" />
        </button>
      )}
      {menu}
    </div>
  );
}
