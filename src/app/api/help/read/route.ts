import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";

/** They opened Help: the replies in it are read, and the dot goes. */
export async function POST() {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { error } = await createAdminClient().from("help_messages").update({ read_at: new Date().toISOString() })
    .eq("user_id", gate.user.id).eq("from_admin", true).is("read_at", null);
  if (error) return NextResponse.json({ error: "Couldn't mark it read." }, { status: 500 });
  return NextResponse.json({ read: true });
}
