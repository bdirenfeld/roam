import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/adminView";
import { cleanBody, isUuid } from "@/lib/help/message";

/**
 * Brennan's answer, into one thread (a person's journey, or their general one).
 * Admin only, and only where that person has written: 404 for anything else.
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!isAdmin(gate.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const j = (await req.json().catch(() => null)) as { id?: unknown; userId?: unknown; tripId?: unknown; body?: unknown } | null;
  const body = cleanBody(j?.body);
  const tripId = j?.tripId ?? null;
  if (!body || !isUuid(j?.id) || !isUuid(j?.userId) || !(tripId === null || isUuid(tripId))) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
  const db = createAdminClient();
  const theirs = db.from("help_messages").select("id").eq("user_id", j.userId).eq("from_admin", false);
  const { data: wrote, error: readErr } = await (tripId ? theirs.eq("trip_id", tripId) : theirs.is("trip_id", null)).limit(1).maybeSingle();
  if (readErr) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });
  if (!wrote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await db.from("help_messages").insert({ id: j.id, user_id: j.userId, trip_id: tripId, from_admin: true, body, context: { by: gate.user.id } });
  // 23505: the same reply sent twice. It is already there.
  if (error && error.code !== "23505") return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });
  return NextResponse.json({ sent: true });
}
