import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Archive or restore a journey — the single write path shared by every
 * surface (Trip settings, Past journeys) so the two can never diverge.
 *
 * Returns null on success, or a failure message. `.select("id")` forces the
 * updated rows back through RLS, so a zero-row update (wrong id, or a policy
 * the session can't satisfy) reports as a failure instead of looking like
 * success and silently reverting on the next refresh.
 */
export async function setTripArchived(
  supabase: SupabaseClient,
  tripId: string,
  archived: boolean,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("trips")
    .update({ archived, archived_at: archived ? new Date().toISOString() : null })
    .eq("id", tripId)
    .select("id");

  if (error) return error.message;
  if (!data || data.length === 0) return "no journey row was updated";
  return null;
}
