// ── Help: a person's conversation with Roam (24 Nov 2026) ─────────────────
// help_messages has no policies, so these routes use the service role and
// every query is pinned to the signed-in person's own id (as api/errors does).

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/adminView";
import { alertBrennan } from "@/lib/help/alert";
import { MAX_PICTURE_BYTES, cleanBody, isUrgent, isUuid, mayAlert, mayAsk, messageCode, pictureType, safeScreen, tripFromScreen } from "@/lib/help/message";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const db = createAdminClient();
  if (req.nextUrl.searchParams.get("unread")) {
    const { count, error } = await db.from("help_messages").select("id", { count: "exact", head: true })
      .eq("user_id", gate.user.id).eq("from_admin", true).is("read_at", null);
    if (error) return NextResponse.json({ error: "Couldn't check." }, { status: 500 });
    return NextResponse.json({ unread: count ?? 0 });
  }
  const { data, error } = await db.from("help_messages").select("id, from_admin, body, picture_path, created_at")
    .eq("user_id", gate.user.id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Couldn't load your messages." }, { status: 500 });
  return NextResponse.json({
    messages: (data ?? []).reverse().map((m) => ({ id: m.id, mine: !m.from_admin, body: m.body, picture: !!m.picture_path, at: m.created_at })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { user, supabase } = gate;
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  const body = cleanBody(form?.get("body"));
  if (!form || !isUuid(id) || !body) return NextResponse.json({ error: "Write a few words first." }, { status: 400 });

  const db = createAdminClient();
  const now = Date.now();
  const since = (ms: number) => new Date(now - ms).toISOString();
  const { data: recent, error: countErr } = await db.from("help_messages").select("id, from_admin, created_at, alerted, body")
    .eq("user_id", user.id).gte("created_at", since(86400000)).order("created_at", { ascending: false }).limit(100);
  // The limit refuses when it can't count; a broken counter must not open the door.
  if (countErr) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });
  const mine = (recent ?? []).filter((m) => !m.from_admin);
  // A retry of one that landed: say yes, write nothing.
  if (mine.some((m) => m.id === id)) return NextResponse.json({ sent: true, code: messageCode(id) });
  const hourAgo = since(3600000);
  const inHour = mine.filter((m) => Date.parse(m.created_at) >= Date.parse(hourAgo)).length;
  if (!mayAsk(inHour, mine.length, (recent ?? []).some((m) => m.from_admin))) {
    return NextResponse.json({ error: "That's a lot for now. Try again in a while." }, { status: 429 });
  }

  let picturePath: string | null = null;
  const file = form.get("picture");
  if (file && typeof file !== "string") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = bytes.length <= MAX_PICTURE_BYTES ? pictureType(bytes) : null;
    if (!type) return NextResponse.json({ error: "That picture can't be sent. Try another." }, { status: 400 });
    picturePath = `${user.id}/${id}.${type === "image/jpeg" ? "jpg" : type.slice(6)}`;
    const { error } = await db.storage.from("help-pictures").upload(picturePath, bytes, { contentType: type, upsert: true });
    if (error) return NextResponse.json({ error: "Couldn't send the picture. Try again." }, { status: 503 });
  }

  const screen = safeScreen(form.get("screen"));
  const tripId = tripFromScreen(screen);
  const [{ data: trip }, { data: profile }, { data: lastError }] = await Promise.all([
    // Through their own session: RLS decides whether they can see the journey at all.
    tripId ? supabase.from("trips").select("id, user_id").eq("id", tripId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("users").select("name, email, has_paid").eq("id", user.id).maybeSingle(),
    db.from("client_errors").select("id").eq("user_id", user.id).gte("at", since(600000)).order("at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const short = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);
  const context = {
    screen,
    trip_id: trip?.id ?? null,
    role: trip ? (trip.user_id === user.id ? "owner" : "guest") : null,
    paid: profile?.has_paid ?? false,
    device: short(req.headers.get("user-agent"), 300),
    viewport: short(form.get("viewport"), 20),
    language: short(form.get("language"), 20),
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
    error_id: lastError?.id ?? null,
    code: messageCode(id),
  };
  const { error: insErr } = await db.from("help_messages").insert({ id, user_id: user.id, body, picture_path: picturePath, context });
  // Two taps at once, or an id that is someone else's: never read theirs back.
  if (insErr) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });

  const urgent = isUrgent(body);
  const { count: alerts, error: alertErr } = await db.from("help_messages").select("id", { count: "exact", head: true }).eq("alerted", true).gte("created_at", since(86400000));
  if (!alertErr && !isAdmin(user.id) && mayAlert(urgent, alerts ?? 0)) {
    const went = await alertBrennan({ urgent, who: profile?.name ?? profile?.email ?? "Someone", body, screen, code: context.code, origin: req.nextUrl.origin });
    if (went) {
      const { error } = await db.from("help_messages").update({ alerted: true }).eq("id", id);
      if (error) console.error("[Roam] help alert not marked:", error.message);
    }
  }
  return NextResponse.json({ sent: true, code: context.code });
}
