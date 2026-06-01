"use client";

// Client-side guest check for app chrome (BottomNav, DesktopMasthead) so the
// owner-only nav entries — the Plan/Kanban tab and Trip settings — are never
// offered to a guest. The route guards in trip-access.ts are the hard
// guarantee; this just keeps the UI honest. Module-level cache keyed by tripId
// (mirrors the weather/trip caches in CLAUDE.md) — survives client navigations.

import { createClient } from "@/lib/supabase/client";

const cache = new Map<string, boolean>();

/** True when the signed-in user is a guest (member, not owner) of this trip. */
export async function isTripGuest(tripId: string): Promise<boolean> {
  const cached = cache.get(tripId);
  if (cached !== undefined) return cached;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    cache.set(tripId, false);
    return false;
  }

  // A readable trip that the user does not own means they reached it as a
  // member — i.e. a guest. (Owner → not a guest; unreadable → treat as not a
  // guest, the page itself will have redirected.)
  const { data: trip } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .maybeSingle();
  const guest = !!trip && trip.user_id !== user.id;
  cache.set(tripId, guest);
  return guest;
}
