import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/ui/AppHeader";
import TripCard from "@/components/ui/TripCard";
import FirstScreen from "@/components/trips/FirstScreen";
import PastJourneysList from "@/components/trip/PastJourneysList";
import type { Trip } from "@/types/database";
import { fetchAndStoreCover } from "@/lib/unsplash";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { headers } from "next/headers";
import { isPhone } from "@/lib/device";
import { tripHref } from "@/lib/tripHref";
import { belongsInPastJourneys, isPastJourney } from "@/lib/tripRecency";
import { onlySample } from "@/lib/sampleTrip/plan";
import YearView from "@/components/trips/YearView";
import { FAMILY_DATES } from "@/lib/yearView/familyDates";
import { isHouseholdOwner } from "@/lib/household";
import CollapsibleSection from "@/components/trip/CollapsibleSection";
import { getAuthUser } from "@/lib/supabase/authUser";
import { tripMarks, type BookingMark } from "@/lib/booking/marks";
import type { CheckCard } from "@/lib/booking/checklist";
import { SAMPLE_TITLE } from "@/lib/sampleTrip/itinerary";
import JourneysMapButton from "@/components/trips/JourneysMapButton";
import { journeyDots, showsMap } from "@/lib/journeys/mapDots";

const COVER_WAIT_MS = 400;
// Booking marks are worked out for the nearest few upcoming journeys only: each
// costs two small queries, and nobody is booking flights for an eighth trip out.
const MARKS_MAX_TRIPS = 6;

type Server = Awaited<ReturnType<typeof createClient>>;

/**
 * The booking marks for the owner's upcoming journeys (25 Nov 2026): the same
 * reading as the Bookings sheet (lib/booking/marks → checklistRows), from the
 * cards on each journey's days. Any failure means no marks; Journeys never
 * waits on, or breaks over, an icon.
 */
async function loadBookingMarks(supabase: Server, userId: string, trips: Trip[], daysByTrip: Record<string, { id: string; date: string }[]>): Promise<Record<string, BookingMark[]>> {
  const out: Record<string, BookingMark[]> = {};
  if (trips.length === 0) return out;
  try {
    const [{ data: me }, perTrip] = await Promise.all([
      supabase.from("users").select("home_airport, home_country, passport_country").eq("id", userId).maybeSingle(),
      Promise.all(trips.map((t) => Promise.all([
        supabase.from("cards").select("id, day_id, place_id, status, confirmed, start_time, end_time, details, place:places(sub_type, title, address)").eq("trip_id", t.id).not("day_id", "is", null),
        supabase.from("people").select("birthdate").eq("trip_id", t.id),
      ]))),
    ]);
    const home = {
      airport: (me?.home_airport as string | null) ?? null,
      country: (me?.home_country as string | null) ?? null,
      passport: (me?.passport_country as string | null) ?? null,
    };
    trips.forEach((t, i) => {
      const [cards, people] = perTrip[i];
      if (cards.error) return;
      out[t.id] = tripMarks({
        trip: { destination: t.destination ?? "", start_date: t.start_date, end_date: t.end_date, party_size: t.party_size, party_ages: t.party_ages, booking_checklist: t.booking_checklist ?? null },
        home,
        days: daysByTrip[t.id] ?? [],
        cards: (cards.data ?? []) as unknown as CheckCard[],
        birthdates: ((people.data ?? []) as { birthdate: string | null }[]).map((p) => p.birthdate),
      });
    });
  } catch (e) {
    console.error("[journeys] booking marks", e);
  }
  return out;
}

export default async function TripsPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  const [{ data: profile }, { data: rawTrips }, { data: allDays }] = await Promise.all([
    supabase.from("users").select("avatar_url, has_paid").eq("id", user?.id ?? "").single(),
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
    // Never hold Journeys for a cover (3 Oct 2026, launch speed): a trip whose
    // Unsplash search keeps failing made every open wait on it. Give the
    // fetch 400 ms; if it isn't back, render now and it lands on a later visit.
    await Promise.race([
      Promise.all(tripsNeedingCover.map((t: Trip) => fetchAndStoreCover(supabase, t.id, t.destination!))),
      new Promise((r) => setTimeout(r, COVER_WAIT_MS)),
    ]);
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
  // On a computer a journey opens on the week (26 Sep 2026): with no day id
  // the card links to /trips/{id}, which sends an owner to the week and a
  // guest to the day. The phone still links straight to the day.
  const h = await headers();
  const phone = isPhone(h.get("user-agent"), h.get("sec-ch-ua-mobile"));
  const openDayByTrip: Record<string, string> = {};
  if (phone) for (const [tripId, days] of Object.entries(daysByTrip)) {
    const openDay = resolveDefaultDay(days);
    if (openDay) openDayByTrip[tripId] = openDay.id;
  }
  // One step to where the journey opens (lib/tripHref): an owner on a
  // computer straight to the week, never via the day's loading screen.
  const hrefByTrip: Record<string, string> = {};
  for (const t of (rawTrips ?? []) as Trip[]) {
    hrefByTrip[t.id] = tripHref(t.id, { phone, owner: t.user_id === user?.id, openDayId: openDayByTrip[t.id] });
  }

  // Dates are facts, archive is a choice — never mixed (Brennan, Aug 26):
  // "Past journeys" holds only trips whose dates have passed; explicitly
  // archived trips get their own section whatever their dates. `status`
  // plays no part. (When the past list spans years, add year dividers here.)
  const upcoming = trips?.filter((t: Trip) => !belongsInPastJourneys(t)) ?? [];
  const past = trips?.filter((t: Trip) => !t.archived && isPastJourney(t)) ?? [];
  const archivedTrips = trips?.filter((t: Trip) => t.archived === true) ?? [];

  // The booking marks on each upcoming photo: the owner's own journeys. On a
  // phone they sit in the photo's top corner (ui/BookingMarks).
  const marked = !user ? [] : upcoming
    .filter((t: Trip) => t.user_id === user.id && t.title !== SAMPLE_TITLE && t.start_date && t.end_date)
    .slice(0, MARKS_MAX_TRIPS);
  const marksByTrip = await loadBookingMarks(supabase, user?.id ?? "", marked, daysByTrip);

  // The map of every journey (25 Nov 2026), behind a Map button once there
  // are two to put on it. Archived ones and the Example stay off.
  const dots = journeyDots(upcoming as Trip[], past as Trip[], hrefByTrip, SAMPLE_TITLE);

  // Until there is a journey besides the example, the first screen shows.
  const firstSample: Trip | null = (trips ?? []).find((t: Trip) => t.user_id === user?.id) ?? null;

  // The year strip only means anything once a journey has real dates.
  const hasDatedTrips = (trips ?? []).some((t: Trip) => t.start_date && t.end_date);

  return (
    <div>
      <AppHeader avatarUrl={profile?.avatar_url} showNewTrip />

      {/* Desktop bounded column; mobile passes through */}
      <div className="md:max-w-[1100px] md:mx-auto md:px-14 md:pt-10 md:pb-12">

        {/* No page heading. Both headers already say Journeys immediately
            above this, and repeating it cost a line for nothing. */}


        {/* pt-3 on a phone: the header's rule sat directly on the first
            journey's cover with nothing between them. Desktop already had its
            own air from md:pt-10 above. */}
        <div className="px-4 pt-3 pb-6 md:px-0 md:pt-0 md:pb-0 md:mt-2">
          {trips && !onlySample(trips) ? (
            <>
              {/* Upcoming — stacked on mobile, 2-up grid on desktop */}
              {upcoming.length > 0 && (
                <div className="space-y-3 mb-8 md:space-y-0 md:grid md:grid-cols-2 md:gap-7 md:mb-14">
                  {upcoming.map((trip: Trip) => (
                    <TripCard key={trip.id} trip={trip} href={hrefByTrip[trip.id]} owner={trip.user_id === user?.id} marks={marksByTrip[trip.id]} phone={phone} marksPhoneDayId={openDayByTrip[trip.id] ?? null} />
                  ))}
                </div>
              )}

              {/* Your year sits with the journeys it describes, below them
                  rather than above — it answers "when should we go", which is
                  a question you sit down to ask, not something you pass on the
                  way in. Only once a journey has real dates. */}
              {/* Your year is drawn from Brennan's household — his family's
                  birthdays and his kids' school calendar — so it is his alone.
                  Everyone else would see his children's names and dates. */}
              {hasDatedTrips && isHouseholdOwner(user?.id) && (
                <div className="-mx-4 md:mx-0">
                  <YearView
                    familyDates={FAMILY_DATES}
                    trips={(trips ?? []).map((t: Trip) => ({
                      id: t.id,
                      title: t.title,
                      destination: t.destination,
                      start_date: t.start_date,
                      end_date: t.end_date,
                      archived: t.archived === true,
                      destination_lat: t.destination_lat,
                      destination_lng: t.destination_lng,
                      href: hrefByTrip[t.id],
                    }))}
                  />
                </div>
              )}

              {/* Past journeys — folded away by default. Date-past rows are
                  delete-only; there's nothing to restore. */}
              {past.length > 0 && (
                <CollapsibleSection
                  label="Past journeys"
                  className="mt-7 mb-3 md:mt-10"
                >
                  <PastJourneysList trips={past} hrefByTrip={hrefByTrip} userId={user?.id ?? null} />
                </CollapsibleSection>
              )}

              {/* Archived — shelved on purpose, whatever their dates. Only
                  rendered when something is archived. Restore puts a future
                  trip back in Upcoming; a date-past one lands in Past above. */}
              {archivedTrips.length > 0 && (
                <CollapsibleSection label="Archived">
                  <PastJourneysList trips={archivedTrips} hrefByTrip={hrefByTrip} userId={user?.id ?? null} />
                </CollapsibleSection>
              )}
            </>
          ) : (
            <FirstScreen sample={firstSample} sampleHref={firstSample ? hrefByTrip[firstSample.id] : undefined} free={!profile?.has_paid} />
          )}
        </div>
      </div>
      {showsMap(dots) && <JourneysMapButton dots={dots} phone={phone} />}
    </div>
  );
}
