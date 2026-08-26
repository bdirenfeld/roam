import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * /map — Global map tab.
 * Redirects to the user's first upcoming/active trip's map.
 * If no trips exist, shows an empty state.
 */
export default async function MapPage() {
  const supabase = await createClient();

  const { data: trips } = await supabase
    .from("trips")
    .select("id, status, start_date, end_date")
    .in("status", ["active", "planning"])
    .order("start_date", { ascending: true });

  if (trips && trips.length > 0) {
    // The current or next journey, not simply the earliest ever created:
    // first trip that hasn't ended yet; if they've all ended, the most recent.
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const current =
      trips.find((t) => !t.end_date || t.end_date >= todayStr) ?? trips[trips.length - 1];
    redirect(`/trips/${current.id}/map`);
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
      <p className="text-sm font-semibold text-gray-700">No journeys to map</p>
      <p className="text-xs text-gray-400 mt-1">Plan a journey first to see your pins here.</p>
    </div>
  );
}
