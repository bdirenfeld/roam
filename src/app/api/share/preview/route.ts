import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { embedFor, providerOf } from "@/lib/share/embed";
import { fullTikTokUrl, tiktokOembed } from "../_tiktok";

// ── The video you just shared, so the share screen can show it ───────────
// TikTok: follow the short link, then oEmbed for the poster, caption and
// author. Instagram: the player URL only — it gives apps nothing else.
// Anything missing comes back null and the screen simply shows less.

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;

  const link = request.nextUrl.searchParams.get("url");
  const provider = providerOf(link);
  if (!provider) return NextResponse.json({ preview: null });
  if (!(await underQuota(gate.supabase, "embed", QUOTA.embed))) return quotaExceeded("link previews");

  if (provider === "instagram") {
    return NextResponse.json({
      preview: { provider, embedUrl: embedFor(link)?.embedUrl ?? null, poster: null, caption: null, author: null },
    });
  }

  const full = await fullTikTokUrl(link!);
  const o = await tiktokOembed(full);
  return NextResponse.json({
    preview: {
      provider,
      embedUrl: embedFor(full)?.embedUrl ?? null,
      poster: o?.poster ?? null,
      caption: o?.caption ?? null,
      author: o?.author ?? null,
    },
  });
}
