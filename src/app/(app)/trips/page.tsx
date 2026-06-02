import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import TripCard from "@/components/ui/TripCard";
import type { Trip } from "@/types/database";
import { fetchAndStoreCover } from "@/lib/unsplash";

function formatDateShort(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sM = s.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const eM = e.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  if (sM === eM) return `${sM} ${s.getDate()}–${e.getDate()}`;
  return `${sM} ${s.getDate()} – ${eM} ${e.getDate()}`;
}

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawTrips }, { data: firstDays }] = await Promise.all([
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

  // Build a map of tripId → first day id
  const firstDayByTrip: Record<string, string> = {};
  for (const day of firstDays ?? []) {
    if (!firstDayByTrip[day.trip_id]) firstDayByTrip[day.trip_id] = day.id;
  }

  const upcoming = trips?.filter((t: Trip) => t.status !== "completed") ?? [];
  const past = trips?.filter((t: Trip) => t.status === "completed") ?? [];

  // Resolve first name: OAuth metadata → users table → null
  const rawName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    profile?.name ??
    null;
  const firstName = rawName ? rawName.trim().split(/\s+/)[0] : null;

  const destination = upcoming[0]?.destination?.split(",")[0]?.trim() ?? null;

  const greeting = firstName
    ? destination
      ? `${firstName}. ${destination} awaits.`
      : `${firstName}. Where to next?`
    : destination
    ? `${destination} awaits.`
    : "My Trips";

  // Two-color desktop greeting: split on first ". " — name in ink, tagline in caption.
  const sepIdx = greeting.indexOf(". ");
  const greetingName = sepIdx > -1 ? greeting.slice(0, sepIdx + 1) : greeting;
  const greetingTagline = sepIdx > -1 ? greeting.slice(sepIdx + 2) : "";

  return (
    <div>
      <AppHeader avatarUrl={profile?.avatar_url} showNewTrip />

      {/* Desktop bounded column; mobile passes through */}
      <div className="md:max-w-[1100px] md:mx-auto md:px-14 md:pt-10 md:pb-12">

        {/* Greeting deck */}
        <div className="px-4 pt-5 pb-3 md:px-0 md:pt-0 md:pb-0">
          {/* Mobile — single-color */}
          <h2 className="md:hidden font-display italic font-normal text-lg text-gray-900">
            {greeting}
          </h2>
          {/* Desktop — two-color deck + trip-count meta */}
          <div className="hidden md:block">
            <h2
              className="font-display italic font-normal"
              style={{ fontSize: 30, letterSpacing: "-0.01em", lineHeight: 1.2 }}
            >
              <span style={{ color: "#1A1A2E" }}>{greetingName}</span>
              {greetingTagline && (
                <span style={{ color: "rgba(26,26,46,0.55)" }}>{" "}{greetingTagline}</span>
              )}
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
          {trips && trips.length > 0 ? (
            <>
              {/* Upcoming — stacked on mobile, 2-up grid on desktop */}
              {upcoming.length > 0 && (
                <div className="space-y-3 mb-8 md:space-y-0 md:grid md:grid-cols-2 md:gap-7 md:mb-14">
                  {upcoming.map((trip: Trip) => (
                    <TripCard key={trip.id} trip={trip} firstDayId={firstDayByTrip[trip.id]} />
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

                  {/* Mobile — compact rows */}
                  <div className="md:hidden">
                    {past.map((trip: Trip) => (
                      <Link
                        key={trip.id}
                        href="/past-journeys"
                        className="flex items-center gap-3 py-3 border-b border-black/5"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: "#D4CFC8" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-display italic text-[13px] truncate"
                            style={{ color: "#9CA3AF" }}
                          >
                            {trip.title}
                          </p>
                          <p
                            className="text-[9px] uppercase tracking-widest mt-0.5"
                            style={{ color: "#C4C0B8" }}
                          >
                            {formatDateShort(trip.start_date, trip.end_date)}
                          </p>
                        </div>
                        <span style={{ color: "#D4CFC8", fontSize: "14px" }}>›</span>
                      </Link>
                    ))}
                  </div>

                  {/* Desktop — editorial rows with circular cover */}
                  <div className="hidden md:block">
                    {past.map((trip: Trip) => (
                      <Link
                        key={trip.id}
                        href="/past-journeys"
                        className="flex items-center gap-[18px] py-[14px] px-1 hover:opacity-80 transition-opacity"
                      >
                        <div
                          className="w-14 h-14 rounded-full flex-shrink-0"
                          style={{
                            backgroundImage: trip.cover_image_url
                              ? `url(${trip.cover_image_url})`
                              : undefined,
                            backgroundColor: trip.cover_image_url ? undefined : "#E8E3DA",
                            backgroundSize: "cover",
                            backgroundPosition: "50% 50%",
                            boxShadow: "0 0 0 1px rgba(26,26,46,0.10)",
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className="font-display italic truncate"
                            style={{
                              fontSize: 18,
                              fontWeight: 500,
                              color: "#1A1A2E",
                              letterSpacing: "-0.005em",
                            }}
                          >
                            {trip.title}
                          </div>
                          <div
                            className="mt-1"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              textTransform: "uppercase",
                              letterSpacing: "0.14em",
                              color: "rgba(26,26,46,0.55)",
                            }}
                          >
                            {formatDateShort(trip.start_date, trip.end_date)}
                          </div>
                        </div>
                        <span style={{ color: "rgba(26,26,46,0.40)", fontSize: 16 }}>›</span>
                      </Link>
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
    </div>
  );
}
