import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import IdeasClient, { type Idea } from "@/components/trip/IdeasClient";
import type { JourneySummary } from "@/components/trip/PromoteToWishlistSheet";

export default async function IdeasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: ideas }, { data: trips }] = await Promise.all([
    supabase
      .from("ideas")
      .select(
        "id, url, title, note, source, status, tags, created_at, wishlist_destination_id, pins_added, pinned_trip_id, place"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Journeys still worth adding a place to. A finished trip is not somewhere
    // to put a restaurant, and archived ones would bury the list you want.
    supabase
      .from("trips")
      .select("id, title, destination, destination_lat, destination_lng, end_date")
      .eq("user_id", user.id)
      .eq("archived", false)
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true }),
  ]);

  return (
    <IdeasClient
      initial={(ideas ?? []) as Idea[]}
      journeys={(trips ?? []) as JourneySummary[]}
    />
  );
}
