import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EstimateClient from "@/components/trip/EstimateClient";
import { getTripAccess } from "@/lib/trip-access";
import { loadEstimate } from "@/lib/budget/load";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function EstimatePage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  // The estimate is the owner's own planning figure — a guest reads the journey
  // but has no business seeing what it costs. Same guard as Trip Settings.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if ((await getTripAccess(supabase, tripId, user?.id)) === "guest") {
    redirect(`/trips/${tripId}`);
  }

  const data = await loadEstimate(supabase, tripId);
  if (!data) redirect("/trips");

  return (
    <EstimateClient
      tripId={tripId}
      tripTitle={data.tripTitle}
      initialAssumptions={data.assumptions}
      initialBasis={data.basis}
      uncostedExcursions={data.uncostedExcursions}
      rolledExcursionCount={data.rolledExcursionCount}
      dateRange={data.dateRange}
      distanceKm={data.distanceKm}
      peak={data.peak}
    />
  );
}
