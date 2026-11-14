/**
 * The place a travel card ends at (14 Nov 2026). Shared by Add travel and the
 * card's From / To editor, so both write it the same way.
 *
 * A travel card always ends at a logistics/transit place, as every travel card
 * has. A station / car park / port already saved as transit is reused, by its
 * place id or its Google id. Anything else (a villa, a restaurant, a town) gets
 * a travel end of its own at the same spot, with no Google id, so the saved
 * place is never retyped: the villa stays a hotel, so stays and check-ins never
 * mistake a drive for a night, and a restaurant card keeps its own place.
 */

import type { createClient } from "@/lib/supabase/client";
import type { LegFrom } from "@/lib/travel/leg";
import { isParkOrStation } from "@/lib/travel/park";

type Client = ReturnType<typeof createClient>;
type Row = { id: string; type: string | null; sub_type: string | null };

export async function travelEnd(supabase: Client, userId: string, to: LegFrom): Promise<string> {
  if (to.place_id) {
    const { data } = await supabase.from("places").select("id, type, sub_type").eq("id", to.place_id).maybeSingle();
    const row = data as Row | null;
    if (row && row.type === "logistics" && row.sub_type === "transit") return row.id;
  }
  if (to.google_place_id) {
    const { data: existing } = await supabase
      .from("places").select("id, type, sub_type").eq("user_id", userId).eq("google_place_id", to.google_place_id).maybeSingle();
    const row = existing as Row | null;
    if (row && row.type === "logistics" && row.sub_type === "transit") return row.id;
    if (!row && isParkOrStation(to.title)) {
      const { data, error } = await supabase.from("places").insert({
        user_id: userId, google_place_id: to.google_place_id, title: to.title, type: "logistics", sub_type: "transit",
        lat: to.lat, lng: to.lng, address: to.address ?? null,
      }).select("id").single();
      if (!error && data) return (data as { id: string }).id;
    }
  }
  const { data, error } = await supabase.from("places").insert({
    user_id: userId, google_place_id: null, title: to.title, type: "logistics", sub_type: "transit",
    lat: to.lat, lng: to.lng, address: to.address ?? null,
    details: to.google_place_id ? { travel_end_of: to.google_place_id } : null,
  }).select("id").single();
  if (error || !data) throw new Error("place");
  return (data as { id: string }).id;
}
