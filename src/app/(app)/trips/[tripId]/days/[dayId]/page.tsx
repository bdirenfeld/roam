import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DayViewClient from "@/components/day/DayViewClient";
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

  // TODO: re-enable auth before deploy
  // if (!user) redirect("/login");

  // Parallel fetch — trip, all days, cards for today, hotel cards for all days, user avatar
  const [
    { data: trip },
    { data: days },
    { data: cards },
    { data: hotelCards },
    { data: profile },
  ] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("days").select("*").eq("trip_id", tripId).order("day_number"),
    supabase
      .from("cards")
      .select("*")
      .eq("day_id", dayId)
      .eq("status", "in_itinerary")
      .order("position"),
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .eq("type", "logistics")
      .eq("sub_type", "hotel"),
    user
      ? supabase.from("users").select("avatar_url").eq("id", user.id).single()
      : Promise.resolve({ data: null, error: null }),
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
      userAvatarUrl={profile?.avatar_url}
    />
  );
}
