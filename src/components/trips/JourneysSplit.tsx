"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { JourneyDot } from "@/lib/journeys/mapDots";
import { JOURNEYS_MAP_WIDTH_KEY, MAP_SHARE, clampMapWidth, readMapWidth } from "@/lib/journeys/split";

// Journeys on a computer (25 Nov 2026, mocks approved): the journeys on the
// left, the map on the right, and a seam between them that drags and is
// remembered, the same seam as the week's (WeekBoard). The page still scrolls
// as one page; the map stays put beside it under the masthead.
//
// The map is a lazy chunk and is only asked for from 1024px up, after the
// journeys are on screen: a phone or a narrow window never loads Mapbox here.

const JourneysMap = dynamic(() => import("./JourneysMap"), { ssr: false });

/** The masthead is 64px tall and sticky (ui/DesktopMasthead). */
const UNDER_MASTHEAD = "sticky top-16 h-[calc(100dvh-64px)]";

export default function JourneysSplit({ dots, children }: { dots: JourneyDot[]; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState<number | null>(null);
  const [hot, setHot] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    try { const v = readMapWidth(localStorage.getItem(JOURNEYS_MAP_WIDTH_KEY)); if (v !== null) setMapWidth(v); } catch { /* private mode */ }
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const onSeamPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setHot(true);
    const move = (ev: PointerEvent) => {
      const frame = frameRef.current;
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      setMapWidth(clampMapWidth(r.width, r.right - ev.clientX));
    };
    const up = () => {
      setHot(false);
      setMapWidth((w) => { try { if (w !== null) localStorage.setItem(JOURNEYS_MAP_WIDTH_KEY, String(w)); } catch { /* ignore */ } return w; });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={frameRef} className="lg:flex lg:items-start" data-testid="journeys-split">
      <div className="min-w-0 lg:flex-1">{children}</div>
      <div
        onPointerDown={onSeamPointerDown}
        className={`hidden lg:flex ${UNDER_MASTHEAD} w-[10px] -mx-[5px] z-10 cursor-col-resize items-center justify-center flex-shrink-0`}
        aria-label="Drag to resize the map"
        role="separator"
        aria-orientation="vertical"
        data-testid="journeys-seam"
      >
        <span className="w-1 h-9 rounded-sm transition-colors" style={{ background: hot ? "#1A1A2E" : "rgba(26,26,46,0.18)" }} />
      </div>
      <div
        className={`hidden lg:block ${UNDER_MASTHEAD} flex-shrink-0`}
        style={{ width: mapWidth ?? `${MAP_SHARE}%` }}
        data-testid="journeys-map-panel"
      >
        {wide && <JourneysMap dots={dots} />}
      </div>
    </div>
  );
}
