import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import TripCard from "@/components/ui/TripCard";
import type { Trip } from "@/types/database";

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TODO: re-enable auth check before deploying
  // if (!user) redirect("/login");

  const [{ data: profile }, { data: trips }, { data: firstDays }] = await Promise.all([
    supabase.from("users").select("name, avatar_url").eq("id", user?.id ?? "").single(),
    supabase
      .from("trips")
      .select("*")
      // .eq("user_id", user.id)
      .order("start_date", { ascending: true }),
    supabase
      .from("days")
      .select("id, trip_id")
      .order("day_number", { ascending: true }),
  ]);

  // Build a map of tripId → first day id
  const firstDayByTrip: Record<string, string> = {};
  for (const day of firstDays ?? []) {
    if (!firstDayByTrip[day.trip_id]) firstDayByTrip[day.trip_id] = day.id;
  }

  const upcoming = trips?.filter((t: Trip) => t.status !== "completed") ?? [];
  const past = trips?.filter((t: Trip) => t.status === "completed") ?? [];
  const firstName = profile?.name?.split(" ")[0];

  return (
    <div>
      <AppHeader avatarUrl={profile?.avatar_url} />

      {/* Greeting + new trip */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {firstName ? `Hey, ${firstName}` : "My Trips"}
          </h2>
          {upcoming.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {upcoming.length} upcoming trip{upcoming.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Link
          href="/trips/new"
          className="flex items-center gap-1.5 bg-activity text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all duration-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Trip
        </Link>
      </div>

      <div className="px-4 pb-6">
        {trips && trips.length > 0 ? (
          <>
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div className="space-y-3 mb-6">
                {upcoming.map((trip: Trip) => (
                  <TripCard key={trip.id} trip={trip} firstDayId={firstDayByTrip[trip.id]} />
                ))}
              </div>
            )}

            {/* Past */}
            {past.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  Past
                </p>
                <div className="space-y-3">
                  {past.map((trip: Trip) => (
                    <TripCard key={trip.id} trip={trip} firstDayId={firstDayByTrip[trip.id]} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="10" r="3" />
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-700">No trips yet</p>
      <p className="text-xs text-gray-400 mt-1 mb-5 max-w-[200px]">
        Plan your first adventure — every great trip starts here.
      </p>
      <Link
        href="/trips/new"
        className="inline-flex items-center gap-2 bg-activity text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Plan a Trip
      </Link>
    </div>
  );
}
