"use client";

// ── Video 1 on the empty Journeys page (2 Oct 2026, video-placement-mock §1) ──
// "Watch: Your first journey · 1 min" takes the grey pin tile's place, so the
// screen gets no longer. Tap plays it full screen; ✕ closes it for good. Never
// plays by itself. Until we know (or once it's gone) the pin tile shows, as
// it always did.

import { useState } from "react";
import { SUPABASE_BASE, useHowToVideos } from "@/hooks/useHowToVideos";
import { fileUrl, forSurface, posterUrl, videoById } from "@/lib/videos/howTo";
import VideoPlayer from "./VideoPlayer";
import { PlayDisc } from "./VideosSheet";

export default function FirstJourneyVideo() {
  const { ready, available, seen, markSeen } = useHowToVideos();
  const [playing, setPlaying] = useState(false);
  const id = ready ? forSurface("journeys-empty", available, seen) : null;
  const v = videoById("first-journey");

  return (
    <>
      {id ? (
        <div className="relative w-full max-w-[288px] rounded-[14px] overflow-hidden bg-white text-left mb-5" style={{ border: "1px solid rgba(26,26,46,0.09)" }} data-testid="first-journey-video">
          <button type="button" onClick={() => { markSeen(v.id); setPlaying(true); }} className="block w-full text-left" aria-label={`Watch: ${v.title}, ${v.length}`}>
            <span className="relative block aspect-video" style={{ background: "#FAF9F6" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterUrl(SUPABASE_BASE, v, available)} alt="" className="w-full h-full object-cover block" />
              <PlayDisc size={46} />
            </span>
            <span className="flex items-baseline gap-1.5 px-3 pt-2.5 pb-[11px]">
              <span className="text-[14.5px] font-semibold" style={{ color: "#1A1A2E" }}>Watch: {v.title}</span>
              <span className="text-[12.5px]" style={{ color: "rgba(26,26,46,0.62)" }}>· {v.length}</span>
            </span>
          </button>
          <button type="button" onClick={() => markSeen(v.id)} aria-label="Close video"
            className="absolute right-1.5 top-1.5 w-[26px] h-[26px] rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 1px 3px rgba(26,26,46,.15)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="10" r="3" />
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          </svg>
        </div>
      )}
      {playing && (
        <VideoPlayer title={v.title} src={fileUrl(SUPABASE_BASE, v, available)} poster={posterUrl(SUPABASE_BASE, v, available)} onClose={() => setPlaying(false)} />
      )}
    </>
  );
}
