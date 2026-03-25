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
  // TODO: re-enable auth before deploy
  // if (!user) redirect("/login");

  const [
    { data: trip },
    { data: days },
    { data: cards },
    { data: profile },
  ] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("days").select("*").eq("trip_id", tripId).order("day_number"),
    supabase
      .from("cards")
      .select("*")
      .eq("trip_id", tripId)
      .neq("status", "cut")
      .order("day_id")
      .order("position"),
    user
      ? supabase.from("users").select("avatar_url").eq("id", user.id).single()
      : Promise.resolve({ data: null, error: null }),
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
