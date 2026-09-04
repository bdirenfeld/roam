import { NextRequest, NextResponse } from "next/server";

// ── Turn a saved link into something that can play inside Roam ────────────
//
// Ideas arrive as links — TikTok, YouTube, Instagram, Maps. Tapping one used
// to leave the app. This route says whether a link has a player and where the
// player lives, so the Ideas row can show it in place (Brennan, Sep 2026:
// "that way people wouldn't leave our app").
//
// Short links (vt.tiktok.com, vm.tiktok.com, youtu.be) are followed to their
// full form first; TikTok's video id lives only in the full URL. Nothing here
// touches the traveller's data, so the answer is cached for a day.

export const revalidate = 86400;

interface Embed {
  provider: "tiktok" | "youtube" | "instagram" | null;
  embedUrl: string | null;
  /** CSS aspect-ratio for the frame. */
  aspect: "9 / 16" | "16 / 9";
  title: string | null;
  thumbnail: string | null;
  /** The resolved, full link — for the "open there" fallback. */
  url: string;
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** Follow redirects on a short link and return where it lands. */
async function resolve(url: string): Promise<string> {
  const host = safeHost(url);
  const isShort = /^(vt|vm)\.tiktok\.com$/.test(host) || /^(www\.)?tiktok\.com$/.test(host) && /\/t\//.test(url) || host === "youtu.be";
  if (!isShort) return url;
  try {
    const res = await withTimeout(fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA } }), 5000);
    return res?.url || url;
  } catch {
    return url;
  }
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function classify(url: string): Embed {
  const host = safeHost(url);
  let m: RegExpMatchArray | null;

  if (/(^|\.)tiktok\.com$/.test(host) && (m = url.match(/\/video\/(\d+)/))) {
    return { provider: "tiktok", embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, aspect: "9 / 16", title: null, thumbnail: null, url };
  }
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") {
    const shorts = url.match(/\/shorts\/([\w-]{6,})/);
    const id = shorts?.[1] ?? url.match(/[?&]v=([\w-]{6,})/)?.[1] ?? (host === "youtu.be" ? url.match(/youtu\.be\/([\w-]{6,})/)?.[1] : undefined);
    if (id) return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}`, aspect: shorts ? "9 / 16" : "16 / 9", title: null, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url };
  }
  if (/(^|\.)instagram\.com$/.test(host) && (m = url.match(/\/(p|reel|reels)\/([\w-]+)/))) {
    const kind = m[1] === "reels" ? "reel" : m[1];
    return { provider: "instagram", embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed/`, aspect: "9 / 16", title: null, thumbnail: null, url };
  }
  return { provider: null, embedUrl: null, aspect: "16 / 9", title: null, thumbnail: null, url };
}

/** TikTok's oEmbed gives a title and a poster; best effort, never required. */
async function tiktokMeta(url: string): Promise<{ title: string | null; thumbnail: string | null }> {
  try {
    const res = await withTimeout(fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA } }), 4000);
    if (!res || !res.ok) return { title: null, thumbnail: null };
    const j = (await res.json()) as { title?: string; thumbnail_url?: string };
    return { title: j.title ?? null, thumbnail: j.thumbnail_url ?? null };
  } catch {
    return { title: null, thumbnail: null };
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  const full = await resolve(raw);
  const embed = classify(full);
  if (embed.provider === "tiktok") {
    const meta = await tiktokMeta(full);
    embed.title = meta.title;
    embed.thumbnail = meta.thumbnail;
  }
  return NextResponse.json(embed, {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
