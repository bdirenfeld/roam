"use client";

// ── A saved video: poster first, player on tap ────────────────────────────
// Asks /api/embed whether the link has a player. The row shows a short
// poster with a play button; the tap that swaps it for the player also
// starts it, so watching is still one tap. Opening a row is for deciding,
// not watching (Brennan, Sep 2026) — a poster is a third the height of the
// player, loads at once, and never plays sound uninvited. A link with no
// player renders nothing here; the row's own link remains underneath.

import { useEffect, useState } from "react";

interface Embed {
  provider: "tiktok" | "youtube" | "instagram" | null;
  embedUrl: string | null;
  aspect: "9 / 16" | "16 / 9";
  title: string | null;
  thumbnail: string | null;
  url: string;
}

const LABEL: Record<NonNullable<Embed["provider"]>, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

/** The player URL with autoplay asked for, where the host honours it. */
function playingUrl(e: Embed): string {
  const u = e.embedUrl as string;
  if (e.provider === "youtube") return `${u}?autoplay=1&playsinline=1`;
  if (e.provider === "tiktok") return `${u}?autoplay=1`;
  return u;
}

export default function IdeaEmbed({ url }: { url: string }) {
  const [embed, setEmbed] = useState<Embed | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPlaying(false);
    setPosterFailed(false);
    fetch(`/api/embed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Embed | null) => { if (!cancelled) setEmbed(j && j.provider ? j : null); })
      .catch(() => { if (!cancelled) setEmbed(null); });
    return () => { cancelled = true; };
  }, [url]);

  if (!embed?.embedUrl) return null;

  const label = LABEL[embed.provider!];
  const portrait = embed.aspect === "9 / 16";
  const poster = !posterFailed && embed.thumbnail ? embed.thumbnail : null;

  return (
    <div className="mb-2.5">
      {playing ? (
        <div
          className="mx-auto overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio: embed.aspect, maxWidth: portrait ? 340 : undefined, width: "100%" }}
        >
          <iframe
            src={playingUrl(embed)}
            title={embed.title ?? `${label} video`}
            allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play the ${label} video`}
          className="relative block w-full overflow-hidden rounded-xl"
          style={{ height: 200, background: "#1A1A2E" }}
        >
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              loading="lazy"
              onError={() => setPosterFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: 0.85 }}
            />
          )}
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: poster ? "rgba(26,26,46,0.12)" : "transparent" }}
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(255,255,255,0.94)", boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" fill="#1A1A2E" />
              </svg>
            </span>
          </span>
          <span
            className="absolute bottom-2 right-2.5 text-[10.5px] uppercase"
            style={{ letterSpacing: "0.08em", color: "rgba(255,255,255,0.92)", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
          >
            {label}
          </span>
        </button>
      )}
      {embed.title && (
        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "rgba(26,26,46,0.62)" }}>
          {embed.title}
        </p>
      )}
    </div>
  );
}
