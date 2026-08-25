import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import TripCard from "@/components/ui/TripCard";
import PastJourneysList from "@/components/trip/PastJourneysList";
import type { Trip } from "@/types/database";
import { fetchAndStoreCover } from "@/lib/unsplash";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { belongsInPastJourneys } from "@/lib/tripRecency";
import { createSampleJourney } from "@/lib/sampleTrip/actions";
import AddToHomeScreenHint from "@/components/ui/AddToHomeScreenHint";

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawTrips }, { data: allDays }] = await Promise.all([
    supabase.from("users").select("avatar_url").eq("id", user?.id ?? "").single(),
    supabase
      .from("trips")
      .select("*")
      // .eq("user_id", user.id)
      .order("start_date", { ascending: true }),
    supabase
      .from("days")
      .select("id, trip_id, date")
      .order("day_number", { ascending: true }),
  ]);

  // Backfill cover images for trips that have a destination but no cover yet
  let trips = rawTrips;
  const tripsNeedingCover = (rawTrips ?? []).filter(
    (t: Trip) => t.destination && !t.cover_image_url,
  );
  if (tripsNeedingCover.length > 0) {
    await Promise.all(
      tripsNeedingCover.map((t: Trip) =>
        fetchAndStoreCover(supabase, t.id, t.destination!),
      ),
    );
    // Re-fetch so the newly stored URLs are available for rendering
    const { data: refreshed } = await supabase
      .from("trips")
      .select("*")
      .order("start_date", { ascending: true });
    trips = refreshed;
  }

  // Group every day by trip, then resolve the day each journey should open to
  // when entered from this list: today's day, clamped to the journey range.
  // The shared resolver is the single source of that choice — no Day-1 default.
  const daysByTrip: Record<string, { id: string; date: string }[]> = {};
  for (const day of allDays ?? []) {
    (daysByTrip[day.trip_id] ??= []).push({ id: day.id, date: day.date });
  }
  const openDayByTrip: Record<string, string> = {};
  for (const [tripId, days] of Object.entries(daysByTrip)) {
    const openDay = resolveDefaultDay(days);
    if (openDay) openDayByTrip[tripId] = openDay.id;
  }

  // A journey is "past" when explicitly archived, or by the read-time recency
  // rule: its end_date is >7 days behind us. `status` plays no part.
  const upcoming = trips?.filter((t: Trip) => !belongsInPastJourneys(t)) ?? [];
  const past = trips?.filter((t: Trip) => belongsInPastJourneys(t)) ?? [];

  return (
    <div>
      <AppHeader avatarUrl={profile?.avatar_url} showNewTrip />

      {/* Desktop bounded column; mobile passes through */}
      <div className="md:max-w-[1100px] md:mx-auto md:px-14 md:pt-10 md:pb-12">

        {/* Page header */}
        <div className="px-4 pt-5 pb-3 md:px-0 md:pt-0 md:pb-0">
          {/* Mobile */}
          <h2
            className="md:hidden font-display italic font-normal text-base"
            style={{ color: "#1A1A2E" }}
          >
            Journeys
          </h2>
          {/* Desktop — static header + trip-count meta */}
          <div className="hidden md:block">
            <h2
              className="font-display italic font-normal"
              style={{ fontSize: 24, letterSpacing: "-0.01em", lineHeight: 1.2, color: "#1A1A2E" }}
            >
              Journeys
            </h2>
            <div
              className="font-sans mt-1"
              style={{
                fontSize: 10,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "rgba(26,26,46,0.55)",
              }}
            >
              {upcoming.length} upcoming · {past.length} past
            </div>
          </div>
        </div>

        <div className="px-4 pb-6 md:px-0 md:pb-0 md:mt-9">
          {/* iPhone Safari only — one-time "Add to Home Screen" hint */}
          <AddToHomeScreenHint />
          {trips && trips.length > 0 ? (
            <>
              {/* Upcoming — stacked on mobile, 2-up grid on desktop */}
              {upcoming.length > 0 && (
                <div className="space-y-3 mb-8 md:space-y-0 md:grid md:grid-cols-2 md:gap-7 md:mb-14">
                  {upcoming.map((trip: Trip) => (
                    <TripCard key={trip.id} trip={trip} openDayId={openDayByTrip[trip.id]} />
                  ))}
                </div>
              )}

              {/* Past journeys */}
              {past.length > 0 && (
                <>
                  {/* Hairline divider with centered label */}
                  <div className="mt-6 mb-3 flex items-center gap-3 md:mt-0 md:mb-3.5 md:gap-4">
                    <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
                    <span
                      className="md:hidden font-display italic text-sm"
                      style={{ color: "#B8B4AC" }}
                    >
                      Past journeys
                    </span>
                    <span
                      className="hidden md:inline font-display italic"
                      style={{ fontSize: 15, color: "rgba(26,26,46,0.55)" }}
                    >
                      Past journeys
                    </span>
                    <div className="flex-1" style={{ height: "0.5px", background: "#E8E3DA" }} />
                  </div>

                  {/* Rows with inline Restore/Delete — the one surface for
                      managing past journeys (settings has Restore too). */}
                  <PastJourneysList trips={past} openDayByTrip={openDayByTrip} />
                </>
              )}
            </>
          ) : (
            <EmptyState />
          )}
          {/* Dev-only: the sample-trip button normally lives in EmptyState,
              which an account with journeys never sees. This mirror makes the
              flow testable locally. Stripped from production builds. */}
          {process.env.NODE_ENV === "development" && (
            <form action={createSampleJourney} className="mt-10 text-center">
              <button
                type="submit"
                className="text-[12px] text-gray-300 underline underline-offset-2 hover:text-gray-500 transition-colors"
              >
                Create the sample trip (dev only)
              </button>
            </form>
          )}
        </div>
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
      <p className="text-sm font-semibold text-gray-700">No journeys yet</p>
      <p className="text-xs text-gray-400 mt-1 mb-5 max-w-[220px]">
        Plan your first journey, or wait for one to be shared with you.
      </p>
      {/* Routes to /trips/new; middleware sends an unpaid traveller on to
          /checkout (the paywall) and a paid one to the form — never a dead end. */}
      <Link
        href="/trips/new"
        className="inline-flex items-center gap-2 bg-activity text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Plan a journey
      </Link>
      {/* One-tap sample journey — shows what a finished trip looks like.
          Clearly named, fully deletable; see src/lib/sampleTrip. */}
      <form action={createSampleJourney} className="mt-3">
        <button
          type="submit"
          className="text-[13px] text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
        >
          or try a sample trip first
        </button>
      </form>
    </div>
  );
}
