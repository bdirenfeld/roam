import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EstimateClient from "@/components/trip/EstimateClient";
import { getTripAccess } from "@/lib/trip-access";
import { loadEstimate } from "@/lib/budget/load";
import { getAuthUser } from "@/lib/supabase/authUser";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function EstimatePage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  // The estimate is the owner's own planning figure — a guest reads the journey
  // but has no business seeing what it costs. Same guard as Trip Settings.
  const user = await getAuthUser(supabase);
  if ((await getTripAccess(supabase, tripId, user?.id)) === "guest") {
    redirect(`/trips/${tripId}`);
  }

  const data = await loadEstimate(supabase, tripId, user?.id ?? null);
  if (!data) redirect("/trips");

  return (
    <EstimateClient
      tripId={tripId}
      tripTitle={data.tripTitle}
      initialAssumptions={data.assumptions}
      initialBasis={data.basis}
      uncostedExcursions={data.uncostedExcursions}
      rolledExcursionCount={data.rolledExcursionCount}
      fxToCad={data.fxToCad}
      fxSource={data.fxSource}
      fxReferenceMonth={data.fxReferenceMonth}
      cardCurrency={data.cardCurrency}
      homeCurrency={data.homeCurrency}
      excursionItems={data.excursionItems}
      excursionFree={data.excursionFree}
      cruise={data.cruise}
      bookedSpend={data.bookedSpend}
      dateRange={data.dateRange}
      distanceKm={data.distanceKm}
      peak={data.peak}
    />
  );
}
