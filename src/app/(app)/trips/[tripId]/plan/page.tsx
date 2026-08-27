import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PlanBoard from "@/components/plan/PlanBoard";
import { getTripAccess } from "@/lib/trip-access";
import { withAttachmentCount } from "@/lib/attachmentCount";
import type { Trip, Day, DayWithCards, Card, TripList, ListWithCards } from "@/types/database";

interface Props {
  params: Promise<{ tripId: string }>;
}

export default async function PlanPage({ params }: Props) {
  const { tripId } = await params;
  const supabase = await createClient();

  // The Plan board is owner-only. A guest can read the trip under RLS, so the
  // not-found check below won't catch them — guard explicitly and send them to
  // the Day view rather than a starved board.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if ((await getTripAccess(supabase, tripId, user?.id)) === "guest") {
    redirect(`/trips/${tripId}`);
  }

  // Cards embed shape — identical for the scheduled and the list query, so a
  // card tile renders the same whichever column it lands in (place details for
  // the face, card_attachments for the paperclip badge).
  const CARD_SELECT = `
    *,
    place:places (
      id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level, website, phone, hours, loved, loved_at
    ),
    card_attachments ( id )
  `;

  const [{ data: trip }, { data: days }, { data: cards }, { data: lists }, { data: listCards }] =
    await Promise.all([
      supabase.from("trips").select("*").eq("id", tripId).single(),
      supabase
        .from("days")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_number"),
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("trip_id", tripId)
        .eq("status", "in_itinerary")
        .order("position"),
      // The traveller's own columns, left to right.
      supabase
        .from("trip_lists")
        .select("*")
        .eq("trip_id", tripId)
        .order("position"),
      // Cards on those lists. UNSCHEDULED IS NOT ON A LIST: every place saved
      // from the map is already a dayless `interested` card, and a journey can
      // hold hundreds of them — mirroring that pile into a board column would
      // bury the board. `list_id` is the membership marker, set only when a
      // card is dropped on or created in a list, so each list starts empty and
      // holds exactly what was put there. `day_id IS NULL` because a card that
      // somehow carries both belongs to the day: it is already in the query
      // above, and showing it twice would be worse than dropping a stale flag.
      supabase
        .from("cards")
        .select(CARD_SELECT)
        .eq("trip_id", tripId)
        .is("day_id", null)
        .not("list_id", "is", null)
        .order("position"),
    ]);

  if (!trip) redirect("/trips");

  const dayList = (days ?? []) as Day[];
  const cardList = (cards ?? []).map(withAttachmentCount);

  // Group cards by day
  const daysWithCards: DayWithCards[] = dayList.map((day) => ({
    ...day,
    cards: cardList.filter((c) => c.day_id === day.id),
  }));

  // No dedupe: these are cards the traveller put here one at a time, not a
  // mirror of anything, so two of the same place would be two deliberate cards.
  const listCardList = (listCards ?? []).map(withAttachmentCount) as Card[];
  const listsWithCards: ListWithCards[] = ((lists ?? []) as TripList[]).map((list) => ({
    ...list,
    cards: listCardList.filter((c) => c.list_id === list.id),
  }));

  return (
    <PlanBoard
      trip={trip as Trip}
      initialDays={daysWithCards}
      initialLists={listsWithCards}
      // Notes ride the `*` select, so they arrive with the page payload and
      // work offline.
      initialNotes={(trip as Trip).notes ?? null}
    />
  );
}
