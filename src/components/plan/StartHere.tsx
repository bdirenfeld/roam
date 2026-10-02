"use client";

// ── A new journey's two ways to start (1 Oct 2026) ────────────────────────
// "Upload a booking" and "Find places", shown only while the journey needs
// them (lib/plan/startHere): each goes on its own once done, so there is
// nothing to dismiss. The week floats it over its empty grid; the phone's
// day puts it above the stops. Mock: start-here.png, approved.

import { startSteps, type StartCard } from "@/lib/plan/startHere";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";

export default function StartHere({ cards, place, reading, onUpload, onFind, floating }: {
  cards: StartCard[];
  /** Where the journey is going, for "places to eat in Tuscany". */
  place: string;
  reading?: boolean;
  onUpload: () => void;
  onFind: () => void;
  /** The week's floating card (a shadow) rather than the phone's inline one (a hairline). */
  floating?: boolean;
}) {
  const { upload, find } = startSteps(cards);
  if (!upload && !find) return null;
  const town = place.split(",")[0].trim() || "the area";
  return (
    <div
      role="group"
      aria-label="Start your journey"
      className="w-full max-w-[360px] bg-white rounded-[14px] p-1 flex flex-col"
      style={floating ? { boxShadow: "0 10px 30px rgba(26,26,46,0.16)" } : { border: "1px solid rgba(26,26,46,0.09)" }}
      data-testid="start-here"
    >
      {upload && (
        <button type="button" onClick={onUpload} disabled={reading} className="flex items-center gap-3 px-3.5 py-3.5 rounded-[10px] text-left hover:bg-[rgba(26,26,46,0.03)] disabled:opacity-60">
          <span aria-hidden className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "#EEF0F6" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>{reading ? "Reading your booking…" : "Upload a booking"}</span>
            <span className="block text-[12.5px] leading-snug mt-px" style={{ color: CAPTION }}>A hotel, flight or car confirmation. Roam puts it on your days.</span>
          </span>
          <span aria-hidden className="text-[18px]" style={{ color: "rgba(26,26,46,0.4)" }}>›</span>
        </button>
      )}
      {upload && find && <span aria-hidden className="mx-3.5 h-px" style={{ background: "rgba(26,26,46,0.07)" }} />}
      {find && (
        <button type="button" onClick={onFind} className="flex items-center gap-3 px-3.5 py-3.5 rounded-[10px] text-left hover:bg-[rgba(26,26,46,0.03)]">
          <span aria-hidden className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "#E7F3EC" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D7A55" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>Find places</span>
            <span className="block text-[12.5px] leading-snug mt-px" style={{ color: CAPTION }}>Things to do and places to eat in {town}.</span>
          </span>
          <span aria-hidden className="text-[18px]" style={{ color: "rgba(26,26,46,0.4)" }}>›</span>
        </button>
      )}
    </div>
  );
}
