import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  // Confirm access before rendering any trip chrome. RLS filters the row out for
  // users who don't own and aren't a member of this trip, so a null result means
  // "no access" — send them back to /trips rather than show an empty shell.
  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .single();

  if (!trip) redirect("/trips");

  // Entering the journey: land on today's day, clamped to the journey range
  // (first day before it starts, last day once it's over). Fetch every day so
  // the shared resolver can pick — never hard-code Day 1.
  const { data: days } = await supabase
    .from("days")
    .select("id, date")
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });

  const openDay = resolveDefaultDay(days ?? []);
  if (openDay) {
    redirect(`/trips/${tripId}/days/${openDay.id}`);
  }

  // No days — show a placeholder
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">No days in this trip yet.</p>
    </div>
  );
}
