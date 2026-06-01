// ============================================================
// Roam — Trip access resolver
// Single source of truth for "what may this user do with this
// journey". Consumed by the Day/Map views, the owner-only route
// guards, and the companion route so the owner/guest/none decision
// is computed one way, in one place.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type TripAccess = "owner" | "guest" | "none";

/**
 * Resolve a user's access to a journey. Reads through the caller's
 * RLS-scoped client:
 *  - owner  → trips.user_id matches the user
 *  - guest  → a trip_members row exists for the user (read via
 *             self_view_memberships)
 *  - none   → neither (or no user)
 *
 * The trip read returns a row for both owner and guest (the guest
 * read policy on trips covers member journeys), so ownership is
 * decided by comparing user_id — never by row presence alone.
 */
export async function getTripAccess(
  supabase: SupabaseClient,
  tripId: string,
  userId: string | null | undefined,
): Promise<TripAccess> {
  if (!userId) return "none";

  const { data: trip } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .maybeSingle();

  if (trip?.user_id === userId) return "owner";

  const { data: member } = await supabase
    .from("trip_members")
    .select("user_id")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  return member ? "guest" : "none";
}
