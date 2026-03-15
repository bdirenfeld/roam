import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FullMapClient from "@/components/map/FullMapClient";
import type { Trip, Day, Card } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripMapPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: trip },
    { data: days },
    { data: cards },
    { data: profile },
  ] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).eq("user_id", user.id).single(),
    supabase.from("days").select("*").eq("trip_id", tripId).order("day_number"),
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "in_itinerary")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("day_id")
      .order("position"),
    supabase.from("users").select("avatar_url").eq("id", user.id).single(),
  ]);

  if (!trip) redirect("/trips");

  return (
    <FullMapClient
      trip={trip as Trip}
      days={(days ?? []) as Day[]}
      cards={(cards ?? []) as Card[]}
      userAvatarUrl={profile?.avatar_url}
    />
  );
}
