import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/help/message";

/**
 * They opened a thread: the replies in THAT thread are read. `ids` are the
 * replies on screen; a reply in another journey's thread keeps its dot.
 * No ids (a page loaded before threads existed): every reply, as it was.
 */
export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const j = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(j?.ids) ? j.ids.filter(isUuid).slice(0, 200) : null;
  if (ids && !ids.length) return NextResponse.json({ read: true });
  let q = createAdminClient().from("help_messages").update({ read_at: new Date().toISOString() })
    .eq("user_id", gate.user.id).eq("from_admin", true).is("read_at", null);
  if (ids) q = q.in("id", ids);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Couldn't mark it read." }, { status: 500 });
  return NextResponse.json({ read: true });
}
