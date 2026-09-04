import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hard-delete a journey: cards, then days, then the trip row.
 *
 * Three screens ran these three statements inline and never read a result
 * (UX audit, Sep 2026, finding 1). A guest's card carried the same "Delete
 * permanently" as the owner's; RLS refused all three statements; the dialog
 * closed and nothing happened, with no word to the user. One helper, one
 * place that checks, one sentence back to the caller.
 *
 * Returns null on success, otherwise the message to show. A partial failure
 * (cards gone, trip still there) is reported the same way — the trip still
 * exists, which is what the user needs to know.
 */
export async function deleteJourney(
  supabase: SupabaseClient,
  tripId: string,
): Promise<string | null> {
  const cards = await supabase.from("cards").delete().eq("trip_id", tripId);
  if (cards.error) return "Couldn't delete this journey. Try again.";
  const days = await supabase.from("days").delete().eq("trip_id", tripId);
  if (days.error) return "Couldn't delete this journey. Try again.";
  const trip = await supabase.from("trips").delete().eq("id", tripId).select("id");
  if (trip.error) return "Couldn't delete this journey. Try again.";
  // RLS refuses silently: no error, zero rows. Say so rather than pretend.
  if (!trip.data || trip.data.length === 0) return "This journey isn't yours to delete.";
  return null;
}
