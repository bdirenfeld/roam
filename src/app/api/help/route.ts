// ── Help: a person's conversations with Roam (24 Nov 2026) ────────────────
// One thread per journey and one outside any journey (lib/help/message threadOf).
// help_messages has no policies, so these routes use the service role and
// every query is pinned to the signed-in person's own id (as api/errors does).

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/adminView";
import { alertBrennan } from "@/lib/help/alert";
import { MAX_PICTURE_BYTES, cleanBody, conversations, isUrgent, isUuid, mayAlert, mayAsk, messageCode, pictureType, safeScreen, threadOf, tripFromScreen, unreadElsewhere, type HelpRow } from "@/lib/help/message";
import { SAMPLE_NAME, SAMPLE_TITLE } from "@/lib/sampleTrip/itinerary";

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
  // How many threads are waiting on Brennan: the number on his own door to the inbox.
  if (req.nextUrl.searchParams.get("waiting")) {
    if (!isAdmin(gate.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: all, error } = await db.from("help_messages").select("id, user_id, trip_id, from_admin, body, created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ error: "Couldn't check." }, { status: 500 });
    return NextResponse.json({ waiting: conversations((all ?? []) as HelpRow[]).filter((c) => c.waiting).length });
  }
  const { data, error } = await db.from("help_messages").select("id, from_admin, body, picture_path, created_at, trip_id, read_at")
    .eq("user_id", gate.user.id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Couldn't load your messages." }, { status: 500 });
  const rows = (data ?? []) as { id: string; from_admin: boolean; body: string; picture_path: string | null; created_at: string; trip_id: string | null; read_at: string | null }[];
  const asked = req.nextUrl.searchParams.get("trip");
  const ids = Array.from(new Set([...rows.map((m) => m.trip_id), isUuid(asked) ? asked : null].filter((v): v is string => !!v)));
  // Through their own session: a journey they can't open has no thread of its own.
  const { data: trips, error: tripErr } = ids.length ? await gate.supabase.from("trips").select("id, title").in("id", ids) : { data: [], error: null };
  // Without the journeys every thread would run together: say it failed instead.
  if (tripErr) return NextResponse.json({ error: "Couldn't load your messages." }, { status: 500 });
  const title: Record<string, string> = {};
  ((trips ?? []) as { id: string; title: string }[]).forEach((t) => { title[t.id] = t.title === SAMPLE_TITLE ? SAMPLE_NAME : t.title; });
  const canOpen = (id: string) => id in title;
  const here = threadOf(asked, canOpen);
  return NextResponse.json({
    thread: here,
    messages: rows.filter((m) => threadOf(m.trip_id, canOpen) === here).reverse().map((m) => ({ id: m.id, mine: !m.from_admin, body: m.body, picture: !!m.picture_path, at: m.created_at })),
    elsewhere: unreadElsewhere(rows, here, canOpen).map((e) => ({ ...e, title: e.trip ? title[e.trip] : null })),
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
  // The thread on screen (the sheet sends it); a page loaded before threads existed sends only the screen.
  const asked = form.has("trip") ? form.get("trip") : tripFromScreen(screen);
  const tripId = isUuid(asked) ? asked : null;
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
  const { error: insErr } = await db.from("help_messages").insert({ id, user_id: user.id, trip_id: trip?.id ?? null, body, picture_path: picturePath, context });
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
