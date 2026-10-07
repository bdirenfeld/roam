"use client";

// ── "Welcome home" on the phone's day (7 Oct 2026, delight audit) ───────────
// The first time the organiser opens a journey in the 14 days after it ends
// (lib/trips/welcomeHome), a small card in the "Your trip's started" spot adds
// the trip up: "Welcome home" / "4 days, 14 places, 3 you loved ♥". It shows
// once: the first show marks it seen on this phone, per journey (localStorage),
// like the eve-of-departure toast — so leaving it open does not bring it back
// next visit (7 Oct 2026, re-audit; it used to be marked only by the ✕). The ✕
// just closes it now. If storage can't be read or written it never shows — a
// card that can't remember it was seen would come back every visit. The day view decides the audience: organiser, phone,
// never the shared page.

import { useEffect, useState } from "react";
import { welcomeHomeKey } from "@/lib/trips/welcomeHome";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const SIENNA = "#C4622D";

export default function WelcomeHomeCard({ tripId, line }: { tripId: string; line: string }) {
  // Hidden until storage says it hasn't been closed (after mount: no storage on the server).
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(welcomeHomeKey(tripId)) !== null) { setOpen(false); return; }
      // Seen as soon as it is shown (7 Oct 2026, re-audit).
      localStorage.setItem(welcomeHomeKey(tripId), new Date().toISOString());
      setOpen(true);
    } catch { setOpen(false); }
  }, [tripId]);
  if (!open) return null;

  const loved = / you loved$/.test(line);
  const close = () => setOpen(false);

  return (
    <div className="mb-4 flex justify-center">
      <div className="w-full max-w-[360px] bg-white rounded-[14px] flex items-center pl-4 pr-2 py-3"
        style={{ border: "1px solid rgba(26,26,46,0.09)" }} data-testid="welcome-home">
        <div className="flex-1 min-w-0">
          <span className="block text-[12.5px] leading-snug" style={{ color: CAPTION }}>Welcome home</span>
          <span className="block text-[14.5px] font-semibold mt-px" style={{ color: INK }}>
            {line}{loved && <span style={{ color: SIENNA }} aria-hidden> ♥</span>}
          </span>
        </div>
        <button type="button" onClick={close} aria-label="Close welcome home"
          className="relative w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full hover:bg-[rgba(26,26,46,0.05)]">
          {/* 36px circle, 44px to the finger: 4px out on every side, inside the
              card's 8px right and 12px vertical padding (7 Oct 2026, re-audit). */}
          <span aria-hidden="true" data-testid="welcome-home-close-target" className="absolute -inset-1" />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.5)" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
