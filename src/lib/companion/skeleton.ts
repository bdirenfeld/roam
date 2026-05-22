// ============================================================
// Roam — Companion trip skeleton
// Assembled ONCE per request, before the model loop, and injected
// into the system prompt. Not rebuilt per loop iteration.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SkeletonResult {
  text: string;
  trip: {
    id: string;
    title: string;
    destination: string;
    destination_lat: number | null;
    destination_lng: number | null;
  };
}

function fmtDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "09:20:00" → "09:20"; null → ""
function fmtTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

interface SkeletonCard {
  id: string;
  day_id: string | null;
  title: string;
  type: string;
  sub_type: string | null;
  start_time: string | null;
  end_time: string | null;
  place: { title: string | null } | { title: string | null }[] | null;
}

/**
 * Build the journey skeleton for the companion. RLS-scoped: the passed
 * client only sees the authenticated user's trips, so a tripId that is
 * not theirs simply returns null.
 */
export async function buildTripSkeleton(
  supabase: SupabaseClient,
  tripId: string,
): Promise<SkeletonResult | null> {
  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, title, destination, destination_lat, destination_lng, start_date, end_date, party_size, party_ages, trip_purpose, accommodation_name",
    )
    .eq("id", tripId)
    .maybeSingle();

  if (!trip) return null;

  const [{ data: days }, { data: cards }, { count: interestedCount }] =
    await Promise.all([
      supabase
        .from("days")
        .select("id, day_number, date, theme")
        .eq("trip_id", tripId)
        .order("day_number"),
      supabase
        .from("cards")
        .select(
          "id, day_id, title, type, sub_type, start_time, end_time, place:places(title)",
        )
        .eq("trip_id", tripId)
        .eq("status", "in_itinerary")
        .order("day_id")
        .order("start_time"),
      supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId)
        .eq("status", "interested"),
    ]);

  const cardList = (cards ?? []) as SkeletonCard[];
  const cardsByDay = new Map<string, SkeletonCard[]>();
  for (const c of cardList) {
    if (!c.day_id) continue;
    const list = cardsByDay.get(c.day_id) ?? [];
    list.push(c);
    cardsByDay.set(c.day_id, list);
  }

  const lines: string[] = [];
  lines.push(`JOURNEY: ${trip.title}`);

  const coords =
    trip.destination_lat != null && trip.destination_lng != null
      ? ` (${trip.destination_lat}, ${trip.destination_lng})`
      : "";
  lines.push(`Destination: ${trip.destination}${coords}`);
  lines.push(
    `Dates: ${trip.start_date} to ${trip.end_date} · Party of ${trip.party_size ?? 1}`,
  );
  if (trip.trip_purpose) lines.push(`Purpose: ${trip.trip_purpose}`);
  if (trip.accommodation_name) lines.push(`Staying: ${trip.accommodation_name}`);
  lines.push("");

  for (const day of days ?? []) {
    const theme = day.theme ? ` — ${day.theme}` : "";
    lines.push(`DAY ${day.day_number} · ${fmtDate(day.date)}${theme}`);
    const dayCards = cardsByDay.get(day.id) ?? [];
    if (dayCards.length === 0) {
      lines.push("  (nothing scheduled yet)");
    } else {
      for (const c of dayCards) {
        const subType = c.sub_type ? `/${c.sub_type}` : "";
        const start = fmtTime(c.start_time);
        const end = fmtTime(c.end_time);
        const time = start ? (end ? `${start}–${end}` : start) : "no time set";
        lines.push(`  [card ${c.id}] ${c.title} · ${c.type}${subType} · ${time}`);
      }
    }
  }

  lines.push("");
  lines.push(
    `Unscheduled places already held in this journey: ${interestedCount ?? 0}`,
  );

  return {
    text: lines.join("\n"),
    trip: {
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      destination_lat: trip.destination_lat,
      destination_lng: trip.destination_lng,
    },
  };
}
