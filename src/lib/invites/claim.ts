/**
 * Join the journeys this person was emailed an invite to, at sign-in (7 Oct
 * 2026). Isha opened her invite, signed in with an emailed link instead of
 * Google, and landed on Journeys without the trip: only the Google button
 * carried the invite through. An invite names an address; signing in with that
 * address proves it, so the membership is made then, whatever door they used.
 * Returns the newest invited trip id, for where to land.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function claimInvites(admin: SupabaseClient, userId: string, email: string | null | undefined): Promise<string | null> {
  const addr = email?.trim().toLowerCase();
  if (!addr) return null;
  const { data: invites } = await admin
    .from("trip_invites")
    .select("trip_id, created_at")
    .eq("email", addr)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  const rows = (invites ?? []) as { trip_id: string; created_at: string }[];
  if (!rows.length) return null;
  for (const r of rows) {
    await admin.from("trip_members").upsert(
      { trip_id: r.trip_id, user_id: userId, role: "guest" },
      { onConflict: "trip_id,user_id", ignoreDuplicates: true },
    );
  }
  await admin
    .from("trip_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq("email", addr)
    .is("accepted_at", null);
  return rows[0].trip_id;
}

/** Where to land: the page they were going to, else the newest trip they were just invited to, else Journeys. */
export function landingAfterSignIn(next: string | null | undefined, invitedTripId: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && next !== "/trips") return next;
  return invitedTripId ? `/trips/${invitedTripId}` : "/trips";
}
