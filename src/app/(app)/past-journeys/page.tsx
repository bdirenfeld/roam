import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/types/database";
import PastJourneysClient from "@/components/trip/PastJourneysClient";

export default async function PastJourneysPage() {
  const supabase = await createClient();
  const { data: trips } = await supabase
    .from("trips")
    .select("*")
    .eq("status", "completed")
    .order("end_date", { ascending: false });

  return <PastJourneysClient initialTrips={(trips ?? []) as Trip[]} />;
}
