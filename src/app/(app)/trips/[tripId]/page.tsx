import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function TripPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get the first day of this trip
  const { data: firstDay } = await supabase
    .from("days")
    .select("id")
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true })
    .limit(1)
    .single();

  if (firstDay) {
    redirect(`/trips/${tripId}/days/${firstDay.id}`);
  }

  // No days — show a placeholder
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">No days in this trip yet.</p>
    </div>
  );
}
