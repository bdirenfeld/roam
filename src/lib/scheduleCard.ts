import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, Place } from "@/types/database";

/**
 * Shared insert helper for placing a saved place onto a day. Both "doors" funnel
 * through here (day-column picker + map pin), so it is the single chokepoint that
 * writes `status: 'in_itinerary'` — no caller invents a status value.
 *
 * Always creates a NEW card; the interested card is never touched, so one place
 * can be scheduled onto several days. Position is the LIVE max for the day (not an
 * in-memory snapshot) since the map caller has no `day.cards` in hand. Returns the
 * created card (with `place` grafted on for render), or null on failure.
 */
export async function scheduleCardOnDay(
  supabase: SupabaseClient,
  args: { tripId: string; dayId: string; placeId: string; place?: Place | null },
): Promise<Card | null> {
  const { tripId, dayId, placeId, place = null } = args;

  // Live max position for this day → append to end.
  const { data: rows } = await supabase
    .from("cards")
    .select("position")
    .eq("day_id", dayId)
    .order("position", { ascending: false })
    .limit(1);
  const position = (rows?.[0]?.position ?? 0) + 1;

  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("cards")
    .insert({
      id,
      day_id:       dayId,
      trip_id:      tripId,
      place_id:     placeId,
      status:       "in_itinerary",
      position,
      start_time:   null,
      end_time:     null,
      details:      {},
      ai_generated: false,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[scheduleCardOnDay] card insert failed:", error);
    return null;
  }

  return { ...(data as Card), place };
}
