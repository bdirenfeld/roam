import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import TripSettingsClient from "@/components/trip/TripSettingsClient";
import { getTripAccess } from "@/lib/trip-access";
import type { Person } from "@/components/trip/TravellersSection";
import type { ShareGuest } from "@/components/trip/ShareJourneySection";
import type { Trip, Day } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripSettingsPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  // Trip Settings is owner-only (it manages the journey, travellers, sharing).
  // A guest can read the trip under RLS, so guard explicitly and bounce them to
  // the Day view.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if ((await getTripAccess(supabase, tripId, user?.id)) === "guest") {
    redirect(`/trips/${tripId}`);
  }

  const [{ data: trip }, { data: days }, { data: people }] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase
      .from("days")
      .select("*")
      .eq("trip_id", tripId)
      .order("day_number"),
    supabase
      .from("people")
      .select("id, name, birthdate, notes, position")
      .eq("trip_id", tripId)
      .order("position", { ascending: true }),
  ]);

  if (!trip) redirect("/trips");

  // Owner confirmed (guest redirected above; none → trip is null → redirected).
  // The share token lives on the trip; guests' user rows are cross-user and
  // RLS-blocked for the owner, so read both via service-role, scoped to this
  // owner's own trip.
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("trip_members")
    .select("user_id")
    .eq("trip_id", tripId)
    .eq("role", "guest");
  const guestIds = (members ?? []).map((m) => m.user_id);
  const { data: guestUsers } = guestIds.length
    ? await admin.from("users").select("id, name, email").in("id", guestIds)
    : { data: [] as { id: string; name: string | null; email: string | null }[] };
  const guests: ShareGuest[] = (guestUsers ?? []).map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
  }));
  const shareToken = (trip as { share_token: string | null }).share_token ?? null;

  return (
    <TripSettingsClient
      trip={trip as Trip}
      days={(days ?? []) as Day[]}
      initialPeople={(people ?? []) as Person[]}
      initialShareToken={shareToken}
      initialGuests={guests}
    />
  );
}
