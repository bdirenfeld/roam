import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlanBoard from "@/components/plan/PlanBoard";
import type { Trip, Day, Card, DayWithCards } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function PlanPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // TODO: re-enable auth before deploy
  // if (!user) redirect("/login");

  const [{ data: trip }, { data: days }, { data: cards }, { data: profile }] =
    await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase
        .from("days")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_number"),
      supabase
        .from("cards")
        .select("*")
        .eq("trip_id", tripId)
        .eq("status", "in_itinerary")
        .order("position"),
      user
        ? supabase
            .from("users")
            .select("avatar_url")
            .eq("id", user.id)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (!trip) redirect("/trips");

  const dayList = (days ?? []) as Day[];
  const cardList = (cards ?? []) as Card[];

  // Group cards by day
  const daysWithCards: DayWithCards[] = dayList.map((day) => ({
    ...day,
    cards: cardList.filter((c) => c.day_id === day.id),
  }));

  return (
    <PlanBoard
      trip={trip as Trip}
      initialDays={daysWithCards}
      userAvatarUrl={profile?.avatar_url}
    />
  );
}
