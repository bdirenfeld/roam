import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/adminView";
import { cleanBody, isUuid } from "@/lib/help/message";

/** Brennan's answer. Admin only, and only to someone who has written: 404 for anyone else. */
export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!isAdmin(gate.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const j = (await req.json().catch(() => null)) as { id?: unknown; userId?: unknown; body?: unknown } | null;
  const body = cleanBody(j?.body);
  if (!body || !isUuid(j?.id) || !isUuid(j?.userId)) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
  const db = createAdminClient();
  const { data: wrote, error: readErr } = await db.from("help_messages").select("id").eq("user_id", j.userId).eq("from_admin", false).limit(1).maybeSingle();
  if (readErr) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });
  if (!wrote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await db.from("help_messages").insert({ id: j.id, user_id: j.userId, from_admin: true, body, context: { by: gate.user.id } });
  // 23505: the same reply sent twice. It is already there.
  if (error && error.code !== "23505") return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 503 });
  return NextResponse.json({ sent: true });
}
