import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createShareLink } from "@/lib/share-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteLines } from "@/lib/shareCopy";

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
    .select("id, title, share_token, start_date, end_date")
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
  const copy = inviteLines(senderName, journey, trip.start_date, trip.end_date);

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
        subject: copy.subject,
        text: `${copy.lead}\n\n${url}\n\n${copy.how}\n\n— ${senderName}, via Roam\n`,
        html:
          `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1A1A2E;line-height:1.6">` +
          `<p style="font-size:17px;margin:0 0 6px">${escapeHtml(copy.lead)}</p>` +
          `<p style="color:rgba(26,26,46,.7);margin:0 0 16px">${escapeHtml(copy.how)}</p>` +
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
    // Only a send that actually left is recorded, so the list is "who I have
    // emailed", not "who I have typed". Copying the link by hand records
    // nothing — Brennan's call, 19 Sep 2026. A repeat send touches the same
    // row rather than making a second one, and never un-accepts anybody.
    await recordInvite(tripId, email, user.id);

    return NextResponse.json({ sent: true, url });
  } catch (err) {
    console.error("[Roam] Invite send threw:", err);
    return NextResponse.json({ sent: false, reason: "provider-error", url }, { status: 502 });
  }
}

/**
 * Log the send. Best effort on purpose: the email has already gone, and a
 * failed bookkeeping write must not turn a delivered invite into an error the
 * sender sees.
 */
async function recordInvite(tripId: string, email: string, invitedBy: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  // Not an upsert: the only unique index is on (trip_id, lower(email)), and an
  // ON CONFLICT column list can never name an expression, so the upsert that
  // lived here failed with 42P10 on every send and the table stayed empty from
  // 19 to 23 Sep 2026. Look the row up, then update or insert — and read the
  // error, which the upsert never did.
  try {
    const admin = createAdminClient();
    const lower = email.trim().toLowerCase();
    const { data: existing, error: readErr } = await admin
      .from("trip_invites")
      .select("id")
      .eq("trip_id", tripId)
      .eq("email", lower) // always stored lower-cased; ilike would treat _ as a wildcard
      .maybeSingle();
    if (readErr) throw readErr;
    const { error } = existing
      ? await admin
          .from("trip_invites")
          .update({ invited_by: invitedBy, created_at: new Date().toISOString() })
          .eq("id", existing.id)
      : await admin
          .from("trip_invites")
          .insert({ trip_id: tripId, email: lower, invited_by: invitedBy });
    if (error) throw error;
  } catch (err) {
    console.error("[Roam] Invite recorded failed (email was sent):", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
