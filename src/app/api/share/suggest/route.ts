import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { overBudget, addSpend } from "@/lib/api/spend";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { isTikTok, trimCaption, parseGuess } from "@/lib/share/caption";
import { fullTikTokUrl, tiktokOembed, withTimeout } from "../_tiktok";
import { isGoogleMapsUrl, readMapsShare, resolveMapsLink, placeFromMapsUrl, mapsQuery, findPlaceUrl } from "@/lib/share/maps";

// ── The place a shared TikTok is probably about ──────────────────────────
//
// Called once when a TikTok is shared to Roam. Caption (TikTok oEmbed) →
// place name (Claude Haiku) → Google place. The answer is a suggestion row
// on the share screen, never a save. Every step fails quietly to
// `{ suggestion: null }`: the search box is the fallback and it always works.
//
// Google Maps too (7 Oct 2026): a place shared from Maps already carries its
// name (in the share text, or in the link once followed), so it goes straight
// to the same Find Place call — no Claude, same daily allowance.

export const maxDuration = 20;

const none = () => NextResponse.json({ suggestion: null });

const SYSTEM = `You read captions of short travel videos and name the one specific place the video is about: a restaurant, bar, hotel, beach, landmark, village or town.
Reply with JSON only: {"name": string|null, "near": string|null}.
"near" is the town or region it is in, if the caption says.
If the video covers several places, is not about a place, or only names a country or large region, reply {"name": null, "near": null}.`;

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;

  const link = request.nextUrl.searchParams.get("url");
  if (isGoogleMapsUrl(link)) return mapsSuggestion(gate.supabase, link!, request.nextUrl.searchParams.get("text"));
  if (!isTikTok(link)) return none();
  if (!(await underQuota(gate.supabase, "shareSuggest", QUOTA.shareSuggest))) return quotaExceeded("place suggestions");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !googleKey) return none();

  const text = (await tiktokOembed(await fullTikTokUrl(link!)))?.caption ?? null;
  if (!text) return none();

  let spendDb: ReturnType<typeof createAdminClient> | null = null;
  try { spendDb = createAdminClient(); } catch { spendDb = null; }
  if (await overBudget(spendDb)) return none();
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
    await addSpend(spendDb, "share suggest", res.usage, res.model);
    guess = parseGuess(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  } catch {
    return none();
  }
  if (!guess) return none();

  return findPlace(guess.query, googleKey);
}

/** A place shared from Google Maps (7 Oct 2026): name + address from the
 *  share text when it has them; otherwise follow the link for the name and
 *  pin, and bias Find Place to that pin. */
async function mapsSuggestion(supabase: Parameters<typeof underQuota>[0], link: string, text: string | null) {
  if (!(await underQuota(supabase, "shareSuggest", QUOTA.shareSuggest))) return quotaExceeded("place suggestions");
  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleKey) return none();

  const shared = readMapsShare(null, text, link);
  let input = mapsQuery(shared?.name, shared?.address);
  let bias: { lat: number; lng: number } | null = null;
  // The link is followed only when the words alone are thin: no name at all,
  // or a name with no address to tell one "Trattoria Mario" from another.
  if (!input || !shared?.address) {
    const full = await resolveMapsLink(link);
    const p = full ? placeFromMapsUrl(full) : null;
    if (p?.lat != null && p.lng != null) bias = { lat: p.lat, lng: p.lng };
    if (!input) input = p?.name ?? null;
  }
  if (!input) return none();
  return findPlace(input, googleKey, bias);
}

async function findPlace(input: string, googleKey: string, bias?: { lat: number; lng: number } | null) {
  try {
    const res = await withTimeout(fetch(findPlaceUrl(input, googleKey, bias)), 5000);
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
