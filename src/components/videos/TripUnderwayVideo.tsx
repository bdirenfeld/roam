"use client";

// ── Video 4 on the phone's day, once the trip is under way (2 Oct 2026) ─────
// "Your trip's started · Watch: Using Roam on your trip · 1 min", a small card
// at the top of the day, styled like video 1's row on Start here. Shown only
// while today (local, date-only) is between the journey's first and last days
// (lib/isSameLocalDay isUnderwayLocal) — the day view decides that and the
// phone. Played or ✕'d, it is gone everywhere (users.videos_seen), and the
// menu still lists it.
//
// First and last day (7 Oct 2026, delight audit): the day view passes
// `moment` (lib/trips/dayMoment) — "Day 1 in Irving · have a great trip" or
// "Last day in Irving". It replaces the card's top line, and once the card is
// played or closed the line stays on its own at the same spot: same size, same
// grey caption, no box, no button.

import { useState } from "react";
import { SUPABASE_BASE, useHowToVideos } from "@/hooks/useHowToVideos";
import { fileUrl, forSurface, posterUrl, videoById } from "@/lib/videos/howTo";
import VideoPlayer from "./VideoPlayer";
import { PlayDisc } from "./VideosSheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";

export default function TripUnderwayVideo({ moment = null }: { moment?: string | null } = {}) {
  const { ready, available, seen, markSeen } = useHowToVideos();
  const [playing, setPlaying] = useState(false);
  const id = ready ? forSurface("trip-underway", available, seen) : null;
  const v = videoById("in-the-app");

  return (
    <>
      {id && (
        <div className="mb-4 flex justify-center">
          <div className="w-full max-w-[360px] bg-white rounded-[14px] p-1 flex items-center pr-2"
            style={{ border: "1px solid rgba(26,26,46,0.09)" }} data-testid="trip-underway-video">
            <button type="button" onClick={() => { markSeen(v.id); setPlaying(true); }}
              className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3 rounded-[10px] text-left hover:bg-[rgba(26,26,46,0.03)]"
              aria-label={`Watch: ${v.title}, ${v.length}`}>
              <span className="relative w-[54px] h-[38px] rounded-[9px] overflow-hidden flex-shrink-0" style={{ background: "#FAF9F6" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={posterUrl(SUPABASE_BASE, v, available)} alt="" className="w-full h-full object-cover block" />
                <PlayDisc size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] leading-snug" style={{ color: CAPTION }}>{moment ?? "Your trip’s started"}</span>
                <span className="block text-[14.5px] font-semibold mt-px" style={{ color: INK }}>Watch: {v.title}</span>
                <span className="block text-[12.5px] leading-snug mt-px" style={{ color: CAPTION }}>{v.length}</span>
              </span>
            </button>
            <button type="button" onClick={() => markSeen(v.id)} aria-label="Close video"
              className="w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full hover:bg-[rgba(26,26,46,0.05)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.5)" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
      )}
      {ready && !id && moment && (
        <div className="mb-4 flex justify-center">
          <p className="w-full max-w-[360px] px-1 text-[12.5px] leading-snug" style={{ color: CAPTION }} data-testid="day-moment">{moment}</p>
        </div>
      )}
      {playing && (
        <VideoPlayer title={v.title} src={fileUrl(SUPABASE_BASE, v, available)} poster={posterUrl(SUPABASE_BASE, v, available)} onClose={() => setPlaying(false)} />
      )}
    </>
  );
}
