import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DayViewClient from "@/components/day/DayViewClient";
import { getTripAccess } from "@/lib/trip-access";
import type { Card, DayWithCards, Trip, Day } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string; dayId: string }>;
}

export default async function DayPage({ params }: Props) {
  const { tripId, dayId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Guests get a read-only Day view; owners get the full editing surface.
  const access = await getTripAccess(supabase, tripId, user?.id);
  const readOnly = access === "guest";
  // Parallel fetch — trip, all days, cards for today, hotel cards for all days
  const [
    { data: trip },
    { data: days },
    { data: cards },
    { data: hotelCards },
  ] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("days").select("*").eq("trip_id", tripId).order("day_number"),
    supabase
      .from("cards")
      .select(`
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours
        )
      `)
      .eq("day_id", dayId)
      .eq("status", "in_itinerary")
      .order("position"),
    supabase
      .from("cards")
      .select(`
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours
        )
      `)
      .eq("trip_id", tripId)
      .eq("type", "logistics")
      .eq("sub_type", "hotel"),
  ]);

  if (!trip) redirect("/trips");

  const currentDay = (days ?? []).find((d: Day) => d.id === dayId);
  if (!currentDay) redirect(`/trips/${tripId}`);

  const dayWithCards: DayWithCards = {
    ...currentDay,
    cards: cards ?? [],
  };

  return (
    <DayViewClient
      trip={trip as Trip}
      days={(days ?? []) as Day[]}
      dayWithCards={dayWithCards}
      hotelCards={(hotelCards ?? []) as Card[]}
      readOnly={readOnly}
    />
  );
}
