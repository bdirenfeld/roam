import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, Place } from "@/types/database";
import { queuedInsert, queuedDelete } from "@/lib/offline/queuedWrite";

/**
 * Shared insert helper for placing a saved place onto a day. Both "doors" funnel
 * through here (day-column picker + map pin), so it is the single chokepoint that
 * writes `status: 'in_itinerary'` — no caller invents a status value.
 *
 * Always creates a NEW card; the source card is never touched, so one place
 * can be scheduled onto several days. Position is the LIVE max for the day (not an
 * in-memory snapshot) since the map caller has no `day.cards` in hand. Returns the
 * created card (with `place` grafted on for render), or null on failure.
 *
 * The optional `details`/`startTime`/`endTime`/`sourceUrl` seed the new row —
 * that is what "copy to another day" needs, and it is the same insert either
 * way, so it stays one chokepoint rather than a parallel write path. `details`
 * is deep-copied so the new card never shares a nested object with its source.
 * `confirmed` always starts false: a copy has not been booked.
 */
/**
 * The next contiguous 1-based position on a day — the LIVE max, read at write
 * time, not from an in-memory snapshot. Exported because the Plan board's
 * lists move an existing row onto a day rather than inserting a new one, and
 * both paths must agree on where "the end of the day" is.
 */
export async function nextPositionForDay(
  supabase: SupabaseClient,
  dayId: string,
): Promise<number> {
  const { data: rows } = await supabase
    .from("cards")
    .select("position")
    .eq("day_id", dayId)
    .order("position", { ascending: false })
    .limit(1);
  return (rows?.[0]?.position ?? 0) + 1;
}

/**
 * The same, for one of the board's named lists. `position` on a card is read
 * within whichever container the card belongs to — a day or a list — so a list
 * needs its own live max or two cards dropped in quick succession would land on
 * the same number and the list's order would be arbitrary.
 */
export async function nextPositionForList(
  supabase: SupabaseClient,
  listId: string,
): Promise<number> {
  const { data: rows } = await supabase
    .from("cards")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);
  return (rows?.[0]?.position ?? 0) + 1;
}

export async function scheduleCardOnDay(
  supabase: SupabaseClient,
  args: {
    tripId: string;
    dayId: string;
    /** Null for an unlinked ("note") card, which has no place row. */
    placeId: string | null;
    place?: Place | null;
    details?: Card["details"];
    startTime?: string | null;
    endTime?: string | null;
    sourceUrl?: string | null;
  },
): Promise<Card | null> {
  const {
    tripId, dayId, placeId, place = null,
    details = {}, startTime = null, endTime = null, sourceUrl = null,
  } = args;

  // Live max position for this day → append to end.
  // Offline the position lookup can't run; "after everything" is the honest
  // answer and the agenda orders by time first anyway.
  let position = 9999;
  try { position = await nextPositionForDay(supabase, dayId); } catch { /* offline */ }

  const id = crypto.randomUUID();
  const row = {
    id,
    day_id:       dayId,
    trip_id:      tripId,
    place_id:     placeId,
    status:       "in_itinerary" as const,
    position,
    start_time:   startTime,
    end_time:     endTime,
    source_url:   sourceUrl,
    details:      JSON.parse(JSON.stringify(details)) as Card["details"],
    ai_generated: false,
    confirmed:    false,
  };
  const { error } = await queuedInsert("cards", row);
  const data = error ? null : { ...row, list_id: null, created_at: new Date().toISOString() };

  if (error || !data) {
    console.error("[scheduleCardOnDay] card insert failed:", error);
    return null;
  }

  return { ...(data as Card), place };
}

/**
 * Take a scheduled card off its day without losing the place.
 *
 * Scheduling copies (see above), so the normal case is: an `interested` copy
 * of the same place already exists on the journey and the scheduled row is
 * simply deleted — the map pin and the saved pile are untouched. When there is
 * no saved copy (the card was created straight onto a day) one is written
 * first, so nothing the traveller chose disappears. Either way the caller
 * ends up deleting `card.id`, which every host already knows how to undo.
 *
 * Returns the saved copy that was created (for hosts that render pins), or
 * null when one already existed; `ok` is false only when the delete failed.
 */
export async function unscheduleCard(
  supabase: SupabaseClient,
  card: Card,
): Promise<{ ok: boolean; created: Card | null }> {
  let created: Card | null = null;
  if (card.place_id) {
    const { data: existing } = await supabase
      .from("cards")
      .select("id")
      .eq("trip_id", card.trip_id)
      .eq("place_id", card.place_id)
      .eq("status", "interested")
      .limit(1)
      .maybeSingle();
    if (!existing) {
      const { data } = await supabase
        .from("cards")
        .insert({
          id:           crypto.randomUUID(),
          day_id:       null,
          trip_id:      card.trip_id,
          place_id:     card.place_id,
          status:       "interested",
          position:     0,
          source_url:   card.source_url,
          details:      JSON.parse(JSON.stringify(card.details ?? {})) as Card["details"],
          ai_generated: card.ai_generated,
          confirmed:    false,
        })
        .select()
        .single();
      if (data) created = { ...(data as Card), place: card.place ?? null };
    }
  }
  const { error } = await queuedDelete("cards", { id: card.id });
  if (error) console.error("[unscheduleCard] delete failed:", error.message);
  return { ok: !error, created };
}
