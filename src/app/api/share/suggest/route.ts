import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { isTikTok, trimCaption, parseGuess } from "@/lib/share/caption";

// ── The place a shared TikTok is probably about ──────────────────────────
//
// Called once when a TikTok is shared to Roam. Caption (TikTok oEmbed) →
// place name (Claude Haiku) → Google place. The answer is a suggestion row
// on the share screen, never a save. Every step fails quietly to
// `{ suggestion: null }`: the search box is the fallback and it always works.

export const maxDuration = 20;

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const none = () => NextResponse.json({ suggestion: null });

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/** A short link's full form, without its tracking query. oEmbed answers far
 *  more often for the full URL than for vt.tiktok.com (6 of 10 vs 4 of 10 on
 *  his saved links). */
async function fullUrl(url: string): Promise<string> {
  try {
    const res = await withTimeout(fetch(url, { redirect: "follow", headers: { "User-Agent": UA } }), 5000);
    return (res?.url || url).split("?")[0]!;
  } catch {
    return url;
  }
}

async function caption(url: string): Promise<string | null> {
  try {
    const res = await withTimeout(
      fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA } }),
      5000,
    );
    if (!res?.ok) return null;
    const data = (await res.json()) as { title?: unknown };
    return typeof data.title === "string" && data.title.trim() ? data.title : null;
  } catch {
    return null;
  }
}

const SYSTEM = `You read captions of short travel videos and name the one specific place the video is about: a restaurant, bar, hotel, beach, landmark, village or town.
Reply with JSON only: {"name": string|null, "near": string|null}.
"near" is the town or region it is in, if the caption says.
If the video covers several places, is not about a place, or only names a country or large region, reply {"name": null, "near": null}.`;

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;

  const link = request.nextUrl.searchParams.get("url");
  if (!isTikTok(link)) return none();
  if (!(await underQuota(gate.supabase, "shareSuggest", QUOTA.shareSuggest))) return quotaExceeded("place suggestions");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !googleKey) return none();

  const text = await caption(await fullUrl(link!));
  if (!text) return none();

  let guess: ReturnType<typeof parseGuess> = null;
  try {
    const client = new Anthropic({ apiKey });
    const res = await withTimeout(
      client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        system: SYSTEM,
        messages: [{ role: "user", content: trimCaption(text) }],
      }),
      8000,
    );
    if (!res) return none();
    guess = parseGuess(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  } catch {
    return none();
  }
  if (!guess) return none();

  try {
    const u = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    u.searchParams.set("input", guess.query);
    u.searchParams.set("inputtype", "textquery");
    u.searchParams.set("fields", "place_id,name,formatted_address");
    u.searchParams.set("key", googleKey);
    const res = await withTimeout(fetch(u.toString()), 5000);
    const data = (await res?.json()) as { candidates?: { place_id: string; name: string; formatted_address?: string }[] } | undefined;
    const c = data?.candidates?.[0];
    if (!c) return none();
    return NextResponse.json({
      suggestion: { placeId: c.place_id, name: c.name, address: c.formatted_address ?? "" },
    });
  } catch {
    return none();
  }
}
