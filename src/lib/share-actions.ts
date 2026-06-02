"use server";

// ============================================================
// Roam — Share (guest sharing) server actions
// All mutations run through the service-role path: a guest's user row
// and trip_members are not writable/readable by the owner under RLS, so
// the owner-only operations here use the admin client AFTER re-asserting,
// from the server session, that the caller owns the trip. user_id / trip
// ownership is never taken from the request.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTripAccess } from "@/lib/trip-access";

// Re-assert ownership server-side before any admin write. Throws otherwise.
async function assertOwner(tripId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const access = await getTripAccess(supabase, tripId, user.id);
  if (access !== "owner") throw new Error("Not allowed");
}

// URL-safe, collision-resistant enough for a UNIQUE column; short enough to
// share. Hex from a v4 uuid keeps it dependency-free.
function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Turn sharing on. Idempotent: returns the existing token if one is set. */
export async function createShareLink(tripId: string): Promise<string> {
  await assertOwner(tripId);
  const admin = createAdminClient();

  const { data: trip } = await admin
    .from("trips")
    .select("share_token")
    .eq("id", tripId)
    .maybeSingle();
  if (trip?.share_token) return trip.share_token;

  const token = generateToken();
  const { error } = await admin
    .from("trips")
    .update({ share_token: token })
    .eq("id", tripId);
  if (error) throw new Error("Could not create link");
  return token;
}

/** Kill the link (null the token). Existing members keep access — the link is
 *  the claim mechanism, not the access mechanism. */
export async function revokeShareLink(tripId: string): Promise<void> {
  await assertOwner(tripId);
  const admin = createAdminClient();
  const { error } = await admin
    .from("trips")
    .update({ share_token: null })
    .eq("id", tripId);
  if (error) throw new Error("Could not revoke link");
}

/** Remove a single guest — deletes only their membership row. */
export async function removeGuest(tripId: string, userId: string): Promise<void> {
  await assertOwner(tripId);
  const admin = createAdminClient();
  const { error } = await admin
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", userId);
  if (error) throw new Error("Could not remove guest");
}
