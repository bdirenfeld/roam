import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import EstimateClient from "@/components/trip/EstimateClient";
import { getTripAccess } from "@/lib/trip-access";
import type { Assumptions, CardBudget } from "@/lib/budget/model";
import { defaultAssumptions, cardBudgetToCad } from "@/lib/budget/model";

interface Props {
  params: Promise<{ tripId: string }>;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : "";

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

  const [{ data: trip }, { data: days }, { data: cards }, { data: saved }] =
    await Promise.all([
      supabase
        .from("trips")
        .select("id, title, start_date, end_date, party_size")
        .eq("id", tripId)
        .single(),
      supabase.from("days").select("id").eq("trip_id", tripId),
      supabase
        .from("cards")
        .select("id, details, status, places(type)")
        .eq("trip_id", tripId)
        .eq("status", "in_itinerary"),
      supabase.from("trip_budgets").select("*").eq("trip_id", tripId).maybeSingle(),
    ]);

  if (!trip) redirect("/trips");

  const partySize = trip.party_size ?? 1;
  const nights = Math.max((days ?? []).length - 1, 1);
  const fxToCad = Number(saved?.fx_to_cad ?? 1.47);

  // An excursion is any scheduled activity card. Those carrying details.budget
  // seed the Excursions line; the rest are counted so the screen can say plainly
  // how much of the itinerary is still uncosted.
  const cardBudgets: CardBudget[] = [];
  let uncostedExcursions = 0;
  for (const c of cards ?? []) {
    const place = c.places as { type?: string } | null;
    if (place?.type !== "activity") continue;
    const b = (c.details as { budget?: CardBudget } | null)?.budget;
    if (b && typeof b.amount === "number") cardBudgets.push(b);
    else uncostedExcursions += 1;
  }

  // The single FX conversion on this screen, done here so the client never has
  // to think about currency: cards are priced in whatever they were quoted in,
  // and the Excursions line arrives already in home currency.
  const rolledCad = Math.round(
    cardBudgets.reduce((s, b) => s + cardBudgetToCad(b, partySize, fxToCad), 0),
  );

  const seeded = defaultAssumptions(partySize, nights);
  const assumptions: Assumptions = {
    ...seeded,
    excursionsTotal: rolledCad,
    // Anything the traveller has actually set wins, including a hand-typed
    // excursions figure that disagrees with the cards.
    ...((saved?.assumptions ?? {}) as Partial<Assumptions>),
  };

  const dateRange =
    trip.start_date && trip.end_date
      ? `${fmt(trip.start_date)} – ${fmt(trip.end_date)}, ${new Date(trip.end_date + "T12:00:00").getFullYear()}`
      : "";

  return (
    <EstimateClient
      tripId={tripId}
      tripTitle={trip.title ?? "Journey"}
      initialAssumptions={assumptions}
      uncostedExcursions={uncostedExcursions}
      rolledExcursionCount={cardBudgets.length}
      dateRange={dateRange}
    />
  );
}
