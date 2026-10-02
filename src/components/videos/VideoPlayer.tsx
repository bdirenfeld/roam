"use client";

// ── A how-to video, full screen (2 Oct 2026, video-placement-mock) ─────────
// The phone's own player: <video controls playsInline>, so sound, scrubbing,
// rotate-to-landscape and native full screen all come free; the captions are
// drawn into the videos themselves. ✕, Escape or a swipe down closes. Mounted
// on <body> through a portal so no host's stacking context can cover it
// (the menu lives inside headers that are their own layers).

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const SWIPE_PX = 90;

export default function VideoPlayer({ title, src, poster, onClose }: {
  title: string;
  src: string;
  poster?: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    // Opened by a tap, so the browser lets it start with sound; if it
    // refuses, the play button is right there.
    const p = videoRef.current?.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="video-player"
      className="fixed inset-0 z-[95] flex items-center justify-center"
      style={{ background: "#0E0E16" }}
      onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const s = start.current; start.current = null;
        const t = e.changedTouches[0];
        if (!s || !t) return;
        const dy = t.clientY - s.y, dx = Math.abs(t.clientX - s.x);
        if (dy > SWIPE_PX && dx < dy / 2) onClose();
      }}
      onTouchCancel={() => { start.current = null; }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        playsInline
        autoPlay
        preload="auto"
        className="w-full h-full object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close video"
        className="absolute w-11 h-11 rounded-full flex items-center justify-center"
        style={{ right: 14, top: "max(14px, env(safe-area-inset-top))", background: "rgba(255,255,255,0.14)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>,
    document.body,
  );
}
