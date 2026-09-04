"use client";

// ── A saved video, playing inside the idea's row ──────────────────────────
// Asks /api/embed whether the link has a player and shows it in place. Loads
// only once the row is open, so the list stays light. A link with no player
// renders nothing here; the row's own link remains underneath.

import { useEffect, useState } from "react";

interface Embed {
  provider: "tiktok" | "youtube" | "instagram" | null;
  embedUrl: string | null;
  aspect: "9 / 16" | "16 / 9";
  title: string | null;
  url: string;
}

const LABEL: Record<NonNullable<Embed["provider"]>, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
};

export default function IdeaEmbed({ url }: { url: string }) {
  const [embed, setEmbed] = useState<Embed | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/embed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Embed | null) => { if (!cancelled) setEmbed(j && j.provider ? j : null); })
      .catch(() => { if (!cancelled) setEmbed(null); });
    return () => { cancelled = true; };
  }, [url]);

  if (!embed?.embedUrl) return null;

  const portrait = embed.aspect === "9 / 16";
  return (
    <div className="mb-2.5">
      <div
        className="mx-auto overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: embed.aspect, maxWidth: portrait ? 340 : undefined, width: "100%" }}
      >
        <iframe
          src={embed.embedUrl}
          title={embed.title ?? `${LABEL[embed.provider!]} video`}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </div>
      {embed.title && (
        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: "rgba(26,26,46,0.62)" }}>
          {embed.title}
        </p>
      )}
    </div>
  );
}
