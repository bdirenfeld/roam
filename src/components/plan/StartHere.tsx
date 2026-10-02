"use client";

// ── A new journey's two ways to start (1 Oct 2026) ────────────────────────
// "Upload a booking" and "Find places", shown only while the journey needs
// them (lib/plan/startHere): each goes on its own once done, so there is
// nothing to dismiss. The week floats it over its empty grid; the phone's
// day puts it above the stops. Mock: start-here.png, approved.
//
// How-to videos (2 Oct 2026, video-placement-mock §2–3): the card also
// carries ONE video, chosen once per visit (lib/videos/howTo startHereVideo).
// Video 1 is a row at the top with its poster; on a computer, a later visit
// shows video 2 as one quiet line at the bottom. Played or ✕'d, it is gone
// everywhere (saved on the account). It goes with the card, too.

import { useEffect, useState } from "react";
import { startSteps, type StartCard } from "@/lib/plan/startHere";
import { SUPABASE_BASE, useHowToVideos } from "@/hooks/useHowToVideos";
import { fileUrl, posterUrl, startHereVideo, videoById, type HowToVideo, type Seen } from "@/lib/videos/howTo";
import VideoPlayer from "@/components/videos/VideoPlayer";
import { PlayDisc } from "@/components/videos/VideosSheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const HR = <span aria-hidden className="mx-3.5 h-px" style={{ background: "rgba(26,26,46,0.07)" }} />;

function CloseX({ size, onClick }: { size: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close video" className="w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full hover:bg-[rgba(26,26,46,0.05)]">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.5)" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

export default function StartHere({ cards, place, reading, onUpload, onFind, floating, firstDay }: {
  cards: StartCard[];
  /** The phone's day: is this the journey's first day? Upload shows only there. The week omits it. */
  firstDay?: boolean;
  /** Where the journey is going, for "places to eat in Tuscany". */
  place: string;
  reading?: boolean;
  onUpload: () => void;
  onFind: () => void;
  /** The week's floating card (a shadow) rather than the phone's inline one (a hairline). */
  floating?: boolean;
}) {
  const vids = useHowToVideos();
  // What was gone when this card first knew: decides the one video for this visit.
  const [atLoad, setAtLoad] = useState<Seen | null>(null);
  const [playing, setPlaying] = useState<HowToVideo | null>(null);
  useEffect(() => {
    if (vids.ready && atLoad === null) setAtLoad(vids.seen);
  }, [vids.ready, vids.seen, atLoad]);

  const { upload, find } = startSteps(cards, { firstDay });
  if (!upload && !find) return playing ? player() : null;
  const town = place.split(",")[0].trim() || "the area";
  // The phone's card carries video 1 on the journey's first day, like Upload.
  const pick = atLoad && (floating || firstDay !== false)
    ? startHereVideo({ computer: !!floating, available: vids.available, seenAtLoad: atLoad, goneNow: vids.seen })
    : null;
  const video = pick ? videoById(pick.id) : null;
  const play = () => { if (!video) return; vids.markSeen(video.id); setPlaying(video); };

  function player() {
    return playing && (
      <VideoPlayer title={playing.title} src={fileUrl(SUPABASE_BASE, playing, vids.available)}
        poster={posterUrl(SUPABASE_BASE, playing, vids.available)} onClose={() => setPlaying(null)} />
    );
  }

  return (
    <div
      role="group"
      aria-label="Start your journey"
      className="w-full max-w-[360px] bg-white rounded-[14px] p-1 flex flex-col"
      style={floating ? { boxShadow: "0 10px 30px rgba(26,26,46,0.16)" } : { border: "1px solid rgba(26,26,46,0.09)" }}
      data-testid="start-here"
    >
      {video && pick?.style === "row" && (
        <>
          <div className="flex items-center pr-2" data-testid="start-video">
            <button type="button" onClick={play} className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-3.5 rounded-[10px] text-left hover:bg-[rgba(26,26,46,0.03)]">
              <span className="relative w-[54px] h-[38px] rounded-[9px] overflow-hidden flex-shrink-0" style={{ background: "#FAF9F6" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={posterUrl(SUPABASE_BASE, video, vids.available)} alt="" className="w-full h-full object-cover block" />
                <PlayDisc size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>Watch: {video.title}</span>
                <span className="block text-[12.5px] leading-snug mt-px" style={{ color: CAPTION }}>{video.length}</span>
              </span>
            </button>
            <CloseX size={12} onClick={() => vids.markSeen(video.id)} />
          </div>
          {HR}
        </>
      )}
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
      {upload && find && HR}
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
      {video && pick?.style === "line" && (
        <>
          {HR}
          <div className="relative flex items-center justify-center" data-testid="start-video">
            <button type="button" onClick={play} className="flex items-center gap-1.5 px-3.5 pt-[9px] pb-2.5 text-[12.5px]" style={{ color: CAPTION }}>
              <span aria-hidden className="w-4 h-4 rounded-full flex items-center justify-center" style={{ border: "1.2px solid rgba(26,26,46,0.5)" }}>
                <svg width="9" height="9" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="rgba(26,26,46,0.7)" /></svg>
              </span>
              <span><span className="underline underline-offset-2" style={{ color: INK, textDecorationColor: "rgba(26,26,46,0.3)" }}>Watch how</span> · {video.length}</span>
            </button>
            <span className="absolute right-1 top-1/2 -translate-y-1/2"><CloseX size={10} onClick={() => vids.markSeen(video.id)} /></span>
          </div>
        </>
      )}
      {player()}
    </div>
  );
}
