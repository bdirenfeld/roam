// Shared by /api/share/preview and /api/share/suggest (a `_` folder is not a
// route). Network only — the parsing that can be tested lives in lib/share.

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** A short link's full form, without its tracking query. oEmbed answers far
 *  more often for the full URL than for vt.tiktok.com (6 of 10 vs 4 of 10 on
 *  his saved links), and only the full URL carries the video id. */
export async function fullTikTokUrl(url: string): Promise<string> {
  try {
    const res = await withTimeout(fetch(url, { redirect: "follow", headers: { "User-Agent": UA } }), 5000);
    return (res?.url || url).split("?")[0]!;
  } catch {
    return url;
  }
}

export interface TikTokOembed {
  caption: string | null;
  author: string | null;
  poster: string | null;
}

export async function tiktokOembed(url: string): Promise<TikTokOembed | null> {
  try {
    const res = await withTimeout(
      fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA } }),
      5000,
    );
    if (!res?.ok) return null;
    const d = (await res.json()) as { title?: unknown; author_unique_id?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      caption: str(d.title),
      author: str(d.author_unique_id) ?? str(d.author_name),
      poster: str(d.thumbnail_url),
    };
  } catch {
    return null;
  }
}
