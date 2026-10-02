"use client";

// ── How-to videos, the way back to them (journey menu → Videos) ────────────
// The house white sheet with its handle on a phone, a centred card on a
// computer. One row per switched-on video: poster, title, length. A tap plays
// it full screen over the sheet; closing the player comes back here.
// Portalled to <body>: the menu that opens it sits inside a header that is its
// own stacking context.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { SUPABASE_BASE, useHowToVideos } from "@/hooks/useHowToVideos";
import { fileUrl, listed, posterUrl, type HowToVideo } from "@/lib/videos/howTo";
import VideoPlayer from "./VideoPlayer";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";

export default function VideosSheet({ onClose }: { onClose: () => void }) {
  const { available, markSeen } = useHowToVideos();
  const [playing, setPlaying] = useState<HowToVideo | null>(null);
  const drag = useSheetDrag(onClose, undefined, { mobileOnly: true });
  useEscapeKey(onClose, !playing);
  const rows = listed(available);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] flex items-end md:items-center md:justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
        <div
          ref={drag.sheetRef}
          onTouchStart={drag.onTouchStart}
          onTouchMove={drag.onTouchMove}
          onTouchEnd={drag.onTouchEnd}
          onTouchCancel={drag.onTouchCancel}
          role="dialog"
          aria-label="How-to videos"
          className="relative w-full max-w-mobile mx-auto md:max-w-[420px] bg-white rounded-t-2xl md:rounded-2xl shadow-sheet flex flex-col animate-in slide-in-from-bottom duration-300"
          style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
        >
          <div className="flex justify-center pt-2.5 md:hidden">
            <div className="w-9 h-[3px] rounded-full" style={{ background: "rgba(26,26,46,0.20)" }} />
          </div>
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <h2 className="font-display" style={{ fontSize: 23, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>How-to videos</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center hover:bg-[rgba(26,26,46,0.06)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-5">
            {rows.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => { markSeen(v.id); setPlaying(v); }}
                className="w-full flex items-center gap-3 py-2.5 text-left"
                style={{ borderTop: "1px solid rgba(26,26,46,0.08)" }}
              >
                <span className="relative w-[104px] h-[58px] rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#FAF9F6" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={posterUrl(SUPABASE_BASE, v, available)} alt="" className="w-full h-full object-cover" />
                  <PlayDisc size={24} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold" style={{ color: INK }}>{v.title}</span>
                  <span className="block text-[12.5px] mt-px" style={{ color: CAPTION }}>{v.length}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {playing && (
        <VideoPlayer
          title={playing.title}
          src={fileUrl(SUPABASE_BASE, playing, available)}
          poster={posterUrl(SUPABASE_BASE, playing, available)}
          onClose={() => setPlaying(null)}
        />
      )}
    </>,
    document.body,
  );
}

/** The ink play disc the mock draws on every poster. */
export function PlayDisc({ size }: { size: number }) {
  const g = Math.round(size * 0.42);
  return (
    <span aria-hidden className="absolute left-1/2 top-1/2 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: "rgba(26,26,46,0.85)" }}>
      <svg width={g} height={g} viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="#fff" /></svg>
    </span>
  );
}
