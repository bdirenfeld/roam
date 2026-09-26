/**
 * Where a shared video can play inside Roam.
 *
 * The share screen shows the video you just shared (Brennan, 26 Sep 2026:
 * "you're going to forget what the thing you're sharing is"). TikTok's player
 * lives at /embed/v2/<id>, which only the full URL carries — a vt.tiktok.com
 * short link has to be followed first. Instagram's lives at
 * /<p|reel>/<code>/embed/ and needs no token.
 */

export type Provider = "tiktok" | "instagram";

export interface Embed {
  provider: Provider;
  embedUrl: string;
}

export function embedFor(url: string | null | undefined): Embed | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)tiktok\.com$/.test(host)) {
    const id = u.pathname.match(/\/video\/(\d+)/)?.[1];
    return id ? { provider: "tiktok", embedUrl: `https://www.tiktok.com/embed/v2/${id}` } : null;
  }
  if (/(^|\.)instagram\.com$/.test(host)) {
    const m = u.pathname.match(/\/(p|reel|reels)\/([\w-]+)/);
    if (!m) return null;
    const kind = m[1] === "p" ? "p" : "reel";
    return { provider: "instagram", embedUrl: `https://www.instagram.com/${kind}/${m[2]}/embed/` };
  }
  return null;
}

/** The app it came from, for the line under the video. */
export function providerOf(url: string | null | undefined): Provider | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  } catch {
    /* not a link */
  }
  return null;
}
