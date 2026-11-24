// ── Delete my account ─────────────────────────────────────────────────────
// Everything, for good: rows (delete_my_account), the journey files in
// storage, then the sign-in itself. Privacy law in Canada, the EU and
// California needs a working version of this, and Google's OAuth review
// asks for it (scale audit, Sept 2026).

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const { supabase, user } = gate;

  // Which folders in the private bucket are theirs: one per journey they own.
  const { data: trips } = await supabase.from("trips").select("id").eq("user_id", user.id);
  const tripIds = (trips ?? []).map((t) => t.id as string);

  // Rows first, as the user (RLS applies inside the function's own checks).
  const { error: rowsErr } = await supabase.rpc("delete_my_account");
  if (rowsErr) {
    console.error("[Roam] delete_my_account failed:", rowsErr.message);
    return NextResponse.json({ error: "Couldn't delete your data. Nothing was removed." }, { status: 500 });
  }

  // Files, then the auth user — both need the service role.
  const admin = createAdminClient();
  for (const tripId of tripIds) {
    const { data: files } = await admin.storage.from("card-attachments").list(tripId, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${tripId}/${f.name}`);
    if (paths.length) await admin.storage.from("card-attachments").remove(paths);
  }
  // Help: the conversation and its pictures. The rows also cascade with the
  // sign-in, but that delete can fail, so they go by name first.
  const { data: pics } = await admin.storage.from("help-pictures").list(user.id, { limit: 1000 });
  const picPaths = (pics ?? []).map((f) => `${user.id}/${f.name}`);
  if (picPaths.length) await admin.storage.from("help-pictures").remove(picPaths);
  const { error: helpErr } = await admin.from("help_messages").delete().eq("user_id", user.id);
  if (helpErr) console.error("[Roam] help messages not deleted:", helpErr.message);
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    console.error("[Roam] deleteUser failed:", authErr.message);
    // Their data is gone; the sign-in record lingering is a cleanup, not a leak.
  }
  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
