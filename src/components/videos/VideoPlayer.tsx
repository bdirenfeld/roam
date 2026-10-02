"use client";

// ── A how-to video (2 Oct 2026, video-placement-mock) ─────────────────────
// The phone's own player: <video controls playsInline>, so sound, scrubbing,
// rotate-to-landscape and native full screen all come free; the captions are
// drawn into the videos themselves. Mounted on <body> through a portal so no
// host's stacking context can cover it (the menu lives inside headers that
// are their own layers).
//
// Phone: full screen; ✕, Escape or a swipe down closes.
// Computer (768 px and up): a centred player about two-thirds of the window
// wide (max 960 px, the video's own shape, lib/videos/howTo widePlayerSize)
// over the page dimmed; ✕, Escape or a click on the dim closes. Full screen
// on a wide monitor was too much (Brennan, 2 Oct 2026).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { widePlayerSize } from "@/lib/videos/howTo";

const SWIPE_PX = 90;
const WIDE = "(min-width: 768px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE);
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return wide;
}

function useViewport(): { vw: number; vh: number } {
  const read = () => ({ vw: typeof window === "undefined" ? 1280 : window.innerWidth, vh: typeof window === "undefined" ? 800 : window.innerHeight });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export default function VideoPlayer({ title, src, poster, onClose }: {
  title: string;
  src: string;
  poster?: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const wide = useWide();
  const { vw, vh } = useViewport();
  // The file's own shape once it is known (16:9 or 4:5); 16:9 until then.
  const [aspect, setAspect] = useState(16 / 9);
  useEscapeKey(onClose);

  useEffect(() => {
    // Opened by a tap, so the browser lets it start with sound; if it
    // refuses, the play button is right there.
    const p = videoRef.current?.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, []);

  if (typeof document === "undefined") return null;
  const size = widePlayerSize(aspect, vw, vh);
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close video"
      className="absolute w-11 h-11 rounded-full flex items-center justify-center"
      style={wide
        ? { right: -6, top: -54, background: "rgba(255,255,255,0.16)" }
        : { right: 14, top: "max(14px, env(safe-area-inset-top))", background: "rgba(255,255,255,0.14)" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
  const video = (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      controls
      playsInline
      autoPlay
      preload="auto"
      onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight); }}
      className={wide ? "w-full h-full object-contain rounded-xl" : "w-full h-full object-contain"}
      style={wide ? { background: "#0E0E16" } : undefined}
    />
  );

  return createPortal(
    wide ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="video-player"
        data-layout="centred"
        className="fixed inset-0 z-[95] flex items-center justify-center"
        style={{ background: "rgba(14,14,22,0.72)" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div data-testid="video-frame" className="relative" style={{ width: size.width, height: size.height, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", borderRadius: 12 }}>
          {video}
          {closeButton}
        </div>
      </div>
    ) : (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="video-player"
        data-layout="full"
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
        {video}
        {closeButton}
      </div>
    ),
    document.body,
  );
}
