"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { JourneyDot } from "@/lib/journeys/mapDots";

// The map of every journey sits behind a Map button on Journeys, on a phone
// and on a computer alike (25 Nov 2026). It was first built beside the list
// on a computer, with a seam to drag; Brennan the same day: the drag is
// "kind of a little clunky", and the list he had asked to leave alone was
// squeezed into a column. So Journeys is the page it was, and the button swaps
// it for the map: under the header, the whole width. List (or Escape) puts
// the journeys back. Mapbox is only asked for once Map is pressed.

const JourneysMap = dynamic(() => import("./JourneysMap"), { ssr: false });

const PILL = "fixed left-1/2 -translate-x-1/2 z-[25] rounded-full px-[22px] py-3 text-[15px] font-semibold text-white active:scale-[0.97] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-activity";
const PILL_STYLE = { background: "#1A1A2E", bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", boxShadow: "0 8px 24px rgba(26,26,46,0.3)" } as const;
// Under the header, which stays put: 57px on a phone (ui/AppHeader: 32px
// controls, 12px above and below, a 1px rule), 64px on a computer (ui/DesktopMasthead).
const SHEET = { phone: "fixed inset-x-0 bottom-0 top-[57px] z-[20] bg-white", computer: "fixed inset-x-0 bottom-0 top-16 z-[20] bg-white" } as const;

export default function JourneysMapButton({ dots, phone }: { dots: JourneyDot[]; phone: boolean }) {
  const [open, setOpen] = useState(false);

  // The list behind must not scroll while the map has the screen; Escape goes back.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = before; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      {open && (
        <div className={phone ? SHEET.phone : SHEET.computer} data-testid="journeys-map-sheet">
          <JourneysMap dots={dots} phone={phone} />
        </div>
      )}
      <button type="button" className={PILL} style={PILL_STYLE} onClick={() => setOpen((o) => !o)} aria-pressed={open} data-testid="journeys-map-toggle">
        {open ? "List" : "Map"}
      </button>
    </>
  );
}
