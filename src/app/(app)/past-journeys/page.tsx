import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/types/database";
import { belongsInPastJourneys } from "@/lib/tripRecency";
import PastJourneysClient from "@/components/trip/PastJourneysClient";

export default async function PastJourneysPage() {
  const supabase = await createClient();
  // Fetch all trips and filter with the shared predicate (archived OR past by
  // the recency rule) so this page always matches the /trips past section.
  const { data: trips } = await supabase
    .from("trips")
    .select("*")
    .order("end_date", { ascending: false });

  const past = ((trips ?? []) as Trip[]).filter(belongsInPastJourneys);

  return <PastJourneysClient initialTrips={past} />;
}
