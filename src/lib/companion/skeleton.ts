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

interface SkeletonPlace {
  title: string | null;
  type: string | null;
  sub_type: string | null;
}

interface SkeletonCard {
  id: string;
  day_id: string | null;
  start_time: string | null;
  end_time: string | null;
  position: number;
  place: SkeletonPlace | SkeletonPlace[] | null;
}

interface SkeletonInterestedCard {
  id: string;
  place: SkeletonPlace | SkeletonPlace[] | null;
}

function placeOf(
  p: SkeletonPlace | SkeletonPlace[] | null,
): SkeletonPlace | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
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
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select(
      "id, title, destination, destination_lat, destination_lng, start_date, end_date, party_size, party_ages, trip_purpose, accommodation_name",
    )
    .eq("id", tripId)
    .maybeSingle();

  // A real query failure (RLS misconfig, network, etc.) must surface — not
  // silently look like "trip not found", which is a legitimate empty result.
  if (tripErr) throw new Error(`Skeleton trip query failed: ${tripErr.message}`);
  if (!trip) return null;

  const [daysRes, cardsRes, interestedRes] = await Promise.all([
    supabase
      .from("days")
      .select("id, day_number, date, theme")
      .eq("trip_id", tripId)
      .order("day_number"),
    supabase
      .from("cards")
      .select(
        "id, day_id, start_time, end_time, position, place:places(title, type, sub_type)",
      )
      .eq("trip_id", tripId)
      .eq("status", "in_itinerary")
      .order("day_id")
      .order("position"),
    supabase
      .from("cards")
      .select("id, place:places(title, type, sub_type)")
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .order("created_at"),
  ]);

  // Distinguish real query failure from a legitimately empty trip: a new
  // journey with no days/cards/interested is valid and renders calmly;
  // a thrown query (e.g. dropped column) must surface, not silently render
  // every day as empty.
  const queryErr = daysRes.error ?? cardsRes.error ?? interestedRes.error;
  if (queryErr) {
    throw new Error(`Skeleton sub-query failed: ${queryErr.message}`);
  }

  const days = daysRes.data;
  const cardList = (cardsRes.data ?? []) as SkeletonCard[];
  const interestedList = (interestedRes.data ?? []) as SkeletonInterestedCard[];
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
        const place = placeOf(c.place);
        const title = place?.title ?? "Untitled";
        const type = place?.type ?? "";
        const subType = place?.sub_type ? `/${place.sub_type}` : "";
        const start = fmtTime(c.start_time);
        const end = fmtTime(c.end_time);
        const time = start ? (end ? `${start}–${end}` : start) : "no time set";
        lines.push(`  [card ${c.id}] ${title} · ${type}${subType} · ${time}`);
      }
    }
  }

  lines.push("");
  lines.push(`UNSCHEDULED PLACES IN THIS JOURNEY (${interestedList.length})`);
  if (interestedList.length === 0) {
    lines.push("  (none yet)");
  } else {
    for (const c of interestedList) {
      const place = placeOf(c.place);
      const title = place?.title ?? "Untitled";
      const type = place?.type ?? "";
      const subType = place?.sub_type ? `/${place.sub_type}` : "";
      lines.push(`  [card ${c.id}] ${title} · ${type}${subType}`);
    }
  }

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
