import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createShareLink } from "@/lib/share-actions";

/**
 * Send a journey invite by email.
 *
 * "Type an address, press send, it's sent" — no mail client, no compose
 * window. That needs a mail provider, so this route reports honestly when
 * one isn't configured (`{ sent: false, reason: "no-provider" }`) and the
 * caller falls back to composing locally rather than pretending an email
 * left the building.
 *
 * To turn real sending on: set RESEND_API_KEY (and optionally
 * SHARE_FROM_EMAIL, default onboarding@resend.dev which needs no domain
 * verification and is fine for a handful of invites).
 */
/**
 * Is sending actually configured in THIS deployment? Answers without sending
 * anything, because "press send and see whether Outlook opens" is a poor way
 * to debug an environment variable. Reports only whether the key is present
 * and which sender is in use — never the key itself.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json({
    configured: !!process.env.RESEND_API_KEY,
    from: process.env.SHARE_FROM_EMAIL ?? "Roam <onboarding@resend.dev>",
  });
}

export async function POST(request: NextRequest) {
  const { trip_id: tripId, email } = (await request.json()) as {
    trip_id?: string;
    email?: string;
  };

  if (!tripId || !email) {
    return NextResponse.json({ error: "trip_id and email required" }, { status: 400 });
  }
  // Deliberately loose: the mail provider is the real validator, and a
  // rejected address should read as "that didn't send", not a form error.
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // RLS: only the owner can read their own trip row, so this doubles as the
  // ownership check — a guest gets no row and no invite.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, title, share_token")
    .eq("id", tripId)
    .single();
  if (!trip) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

  const token = trip.share_token ?? (await createShareLink(tripId));
  const origin = request.nextUrl.origin;
  const url = `${origin}/journey/${token}`;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Nothing is broken — the caller composes locally instead.
    return NextResponse.json({ sent: false, reason: "no-provider", url });
  }

  const from = process.env.SHARE_FROM_EMAIL ?? "Roam <onboarding@resend.dev>";
  const senderName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    "Someone";
  const journey = trip.title ?? "a journey";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: user.email ?? undefined,
        subject: `${senderName} shared “${journey}” with you`,
        text:
          `${senderName} shared a journey with you on Roam.\n\n` +
          `${journey}\n${url}\n\n` +
          `Open the link and sign in to see the plan — the days, the map, the places.\n`,
        html:
          `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1A2E;line-height:1.6">` +
          `<p>${escapeHtml(senderName)} shared a journey with you on Roam.</p>` +
          `<p style="font-size:19px;font-style:italic;margin:18px 0 6px">${escapeHtml(journey)}</p>` +
          `<p><a href="${url}" style="display:inline-block;background:#1A1A2E;color:#F5F4F1;` +
          `padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">See the plan</a></p>` +
          `<p style="color:rgba(26,26,46,.55);font-size:13px">Or open: ${url}</p>` +
          `</div>`,
      }),
    });

    if (!res.ok) {
      const raw = await res.text();
      console.error("[Roam] Invite send failed:", res.status, raw);
      // Hand the provider's own words back. Resend says exactly what's wrong
      // ("domain is not verified", "API key is invalid") and swallowing that
      // leaves the only person who can fix it guessing.
      let detail = `Resend refused it (${res.status}).`;
      try {
        const parsed = JSON.parse(raw) as { message?: string; error?: string };
        if (parsed.message || parsed.error) detail = String(parsed.message ?? parsed.error);
      } catch { /* keep the status-code version */ }
      return NextResponse.json({ sent: false, reason: "provider-error", detail, url }, { status: 502 });
    }
    return NextResponse.json({ sent: true, url });
  } catch (err) {
    console.error("[Roam] Invite send threw:", err);
    return NextResponse.json({ sent: false, reason: "provider-error", url }, { status: 502 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
