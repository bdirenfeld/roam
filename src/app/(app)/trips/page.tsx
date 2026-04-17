import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import type { Trip } from "@/types/database";
import { fetchAndStoreCover } from "@/lib/unsplash";

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const day1 = s.getDate();
  const day2 = e.getDate();
  const month = e.toLocaleDateString("en-GB", { month: "long" });
  return `${day1} — ${day2} ${month}`;
}

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // TODO: re-enable auth check before deploying
  // if (!user) redirect("/login");

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

  const allTrips = trips ?? [];
  const ghostsNeeded = Math.max(0, 3 - allTrips.length);
  const avatarUrl = profile?.avatar_url;

  return (
    <div style={{ background: "#FAF7F2", minHeight: "100vh", padding: "40px 48px" }}>
      {/* Magazine header */}
      <div className="flex items-baseline justify-between mb-8">
        <div className="flex items-baseline gap-3">
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontStyle: "italic",
              fontSize: "48px",
              fontWeight: 500,
              color: "#1A1A2E",
            }}
          >
            Roam
          </h1>
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: "14px",
              color: "#6B6B6B",
              letterSpacing: "0.035em",
            }}
          >
            — Plan like an obsessive. Travel like it&apos;s effortless.
          </span>
        </div>

        {/* Right: new trip button + profile avatar */}
        <div className="flex items-center gap-3">
          <Link href="/trips/new">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "#1A1A2E" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </Link>
          <Link href="/profile">
            <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Profile" width={32} height={32} className="object-cover" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
          </Link>
        </div>
      </div>

      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#6B6B6B",
          marginBottom: "24px",
        }}
      >
        Your Journeys
      </p>

      {/* Magazine grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allTrips.map((trip: Trip) => {
          const href = firstDayByTrip[trip.id]
            ? `/trips/${trip.id}/days/${firstDayByTrip[trip.id]}`
            : `/trips/${trip.id}`;
          const statusLabel =
            trip.status === "planning"
              ? "Planning"
              : trip.status === "completed"
              ? "Complete"
              : "Upcoming";

          return (
            <Link key={trip.id} href={href} className="block group">
              <div
                className="relative overflow-hidden cursor-pointer rounded-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
                style={{ aspectRatio: "3/4" }}
              >
                {/* Full-bleed cover image */}
                {trip.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={trip.cover_image_url}
                    alt={trip.destination ?? ""}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: "#2A2A3E" }} />
                )}

                {/* Gradient scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Status pill — top left */}
                <div
                  className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1"
                  style={{
                    background: "rgba(250, 247, 242, 0.92)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "#C4622D" }}
                  />
                  <span
                    className="text-[10px] tracking-[0.12em] uppercase font-medium"
                    style={{ fontFamily: "DM Sans, sans-serif", color: "#1A1A2E" }}
                  >
                    {statusLabel}
                  </span>
                </div>

                {/* Text overlay — bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h2
                    style={{
                      fontFamily: '"Playfair Display", Georgia, serif',
                      fontStyle: "italic",
                      fontSize: "36px",
                      fontWeight: 500,
                      color: "#FAF7F2",
                      lineHeight: 1.1,
                      marginBottom: "6px",
                    }}
                  >
                    {(trip.destination ?? "").split(",")[0]}
                  </h2>
                  <p
                    style={{
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: "13px",
                      color: "rgba(250, 247, 242, 0.75)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {formatDateRange(trip.start_date, trip.end_date)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}

        {/* Ghost cards — fill to 3 minimum */}
        {Array.from({ length: ghostsNeeded }).map((_, i) => (
          <Link key={`ghost-${i}`} href="/trips/new">
            <div
              className="relative overflow-hidden cursor-pointer flex items-center justify-center"
              style={{
                aspectRatio: "3/4",
                background: "rgba(250, 247, 242, 0.6)",
                border: "1px solid #E8E3DC",
              }}
            >
              <p
                style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontStyle: "italic",
                  fontSize: "18px",
                  color: "#C4622D",
                  opacity: 0.7,
                }}
              >
                Begin a new journey
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
