"use client";

// ── Video 3 on the shared link (2 Oct 2026, video-placement-mock §4) ───────
// A thin white strip above the cover on a visitor's first open: "New here?
// Watch how this works · 45 s" with a ✕. Played or closed, this device
// remembers (localStorage; these people have no account) and it never shows
// again. Renders nothing on the server or before mount, so the page's server
// HTML and first client render agree.

import { useState } from "react";
import { SUPABASE_BASE, useVisitorVideo } from "@/hooks/useHowToVideos";
import { fileUrl, forSurface, posterUrl, videoById } from "@/lib/videos/howTo";
import VideoPlayer from "./VideoPlayer";

export default function SharedVideoStrip() {
  const v = videoById("on-the-trip");
  const { ready, available, gone, dismiss } = useVisitorVideo(v.id);
  const [playing, setPlaying] = useState(false);
  const show = ready && !gone && forSurface("shared-link", available, {}) === v.id;

  return (
    <>
      {show && (
        <div className="relative flex items-center bg-white text-[12.5px]" style={{ borderBottom: "1px solid rgba(26,26,46,0.10)", color: "rgba(26,26,46,0.62)" }} data-testid="shared-video-strip">
          <button type="button" onClick={() => { dismiss(); setPlaying(true); }} className="flex-1 min-w-0 flex items-center gap-[7px] pl-3.5 py-[11px] text-left">
            <span aria-hidden className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0" style={{ border: "1.2px solid rgba(26,26,46,0.5)" }}>
              <svg width="9" height="9" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="rgba(26,26,46,0.7)" /></svg>
            </span>
            <span className="truncate">New here? <span className="underline underline-offset-2" style={{ color: "#1A1A2E", textDecorationColor: "rgba(26,26,46,0.3)" }}>Watch how this works</span> · {v.length}</span>
          </button>
          <button type="button" onClick={dismiss} aria-label="Close video" className="w-11 h-10 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.55)" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      {playing && (
        <VideoPlayer title={v.title} src={fileUrl(SUPABASE_BASE, v, available)} poster={posterUrl(SUPABASE_BASE, v, available)} onClose={() => setPlaying(false)} />
      )}
    </>
  );
}
