import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TripSettingsClient from "@/components/trip/TripSettingsClient";
import type { Trip, Day } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripSettingsPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  const [{ data: trip }, { data: days }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase
      .from("days")
      .select("*")
      .eq("trip_id", tripId)
      .order("day_number"),
  ]);

  if (!trip) redirect("/trips");

  return (
    <TripSettingsClient
      trip={trip as Trip}
      days={(days ?? []) as Day[]}
    />
  );
}
