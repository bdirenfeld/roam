import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * /map — Global map tab.
 * Redirects to the user's first upcoming/active trip's map.
 * If no trips exist, shows an empty state.
 */
export default async function MapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // TODO: re-enable auth before deploy
  // if (!user) redirect("/login");

  const { data: trips } = await supabase
    .from("trips")
    .select("id, status, start_date")
    .in("status", ["active", "planning"])
    .order("start_date", { ascending: true })
    .limit(1);

  if (trips && trips.length > 0) {
    redirect(`/trips/${trips[0].id}/map`);
  }

  // No trips yet
  return (
    <div className="flex flex-col items-center justify-center h-dvh pb-20 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-700">No trips to map</p>
      <p className="text-xs text-gray-400 mt-1">Create a trip first to see your pins here.</p>
    </div>
  );
}
