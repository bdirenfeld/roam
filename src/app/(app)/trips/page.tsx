import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/ui/AppHeader";
import { NewJourneyLink } from "@/components/overlays/AppOverlays";
import TripCard from "@/components/ui/TripCard";
import PastJourneysList from "@/components/trip/PastJourneysList";
import type { Trip } from "@/types/database";
import { fetchAndStoreCover } from "@/lib/unsplash";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { belongsInPastJourneys, isPastJourney } from "@/lib/tripRecency";
import { createSampleJourney } from "@/lib/sampleTrip/actions";
import AddToHomeScreenHint from "@/components/ui/AddToHomeScreenHint";
import YearView from "@/components/trips/YearView";
import CollapsibleSection from "@/components/trip/CollapsibleSection";

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawTrips }, { data: allDays }, { count: ideaCount }] = await Promise.all([
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
    // Unsorted captures only — the badge is a to-triage count, not a total.
    supabase
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user?.id ?? "")
      .eq("status", "inbox"),
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

  // Dates are facts, archive is a choice — never mixed (Brennan, Aug 26):
  // "Past journeys" holds only trips whose dates have passed; explicitly
  // archived trips get their own section whatever their dates. `status`
  // plays no part. (When the past list spans years, add year dividers here.)
  const upcoming = trips?.filter((t: Trip) => !belongsInPastJourneys(t)) ?? [];
  const past = trips?.filter((t: Trip) => !t.archived && isPastJourney(t)) ?? [];
  const archivedTrips = trips?.filter((t: Trip) => t.archived === true) ?? [];

  // The year strip only means anything once a journey has real dates.
  const hasDatedTrips = (trips ?? []).some((t: Trip) => t.start_date && t.end_date);

  return (
    <div>
      <AppHeader avatarUrl={profile?.avatar_url} showNewTrip ideaCount={ideaCount ?? 0} />

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
            {/* Trip counts used to sit here; Brennan reads them as noise.
                The only thing under the title now is YearView's own
                "Your year" control, rendered below. */}
          </div>
        </div>

        {/* Your year — meta line + 12-month planning strip; only once a
            journey has dates */}
        {hasDatedTrips && (
          <YearView
            trips={(trips ?? []).map((t: Trip) => ({
              id: t.id,
              title: t.title,
              destination: t.destination,
              start_date: t.start_date,
              end_date: t.end_date,
              archived: t.archived === true,
              openDayId: openDayByTrip[t.id],
            }))}
          />
        )}

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

              {/* Past journeys — folded away by default. Date-past rows are
                  delete-only; there's nothing to restore. */}
              {past.length > 0 && (
                <CollapsibleSection
                  label="Past journeys"
                  count={past.length}
                  className="mt-6 mb-3 md:mt-0 md:mb-3.5"
                >
                  <PastJourneysList trips={past} openDayByTrip={openDayByTrip} />
                </CollapsibleSection>
              )}

              {/* Archived — shelved on purpose, whatever their dates. Only
                  rendered when something is archived. Restore puts a future
                  trip back in Upcoming; a date-past one lands in Past above. */}
              {archivedTrips.length > 0 && (
                <CollapsibleSection label="Archived" count={archivedTrips.length}>
                  <PastJourneysList trips={archivedTrips} openDayByTrip={openDayByTrip} />
                </CollapsibleSection>
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
      {/* Opens the form in place rather than routing away; still a link to
          /trips/new so ctrl/cmd-click opens the page. */}
      <NewJourneyLink className="inline-flex items-center gap-2 bg-activity text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:opacity-90 active:scale-95 transition-all">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Plan a journey
      </NewJourneyLink>
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
