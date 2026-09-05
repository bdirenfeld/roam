import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createClient } from "@/lib/supabase/server";
import { fetchDestinationPhoto } from "@/lib/unsplash";

/**
 * Auto-generate the Plan board's background from the journey's destination.
 *
 * The board used to open on flat white until someone went and pasted an image
 * URL, so nobody ever did. A board that looks like the place you're going is
 * the single cheapest thing that makes planning feel like planning a trip —
 * and it stays a suggestion: the ··· menu still overrides it, and an override
 * is never clobbered (this only fills an empty column).
 *
 * A landscape shot, not the same photo as the trip cover: the cover is read at
 * card size in a list, the board sits behind twelve columns of white cards.
 */
export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  if (!(await underQuota(gate.supabase, "coverPhoto", QUOTA.coverPhoto))) return quotaExceeded("cover photos");

  const body = (await request.json()) as { trip_id?: string };
  const tripId = body.trip_id;
  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS scopes this to the owner; a guest simply gets no row and no write.
  const { data: trip } = await supabase
    .from("trips")
    .select("destination, kanban_background_url")
    .eq("id", tripId)
    .single();

  if (!trip?.destination) return NextResponse.json({ url: null });

  // Already set — by this route on an earlier visit, or by hand. Leave it.
  if (trip.kanban_background_url) {
    return NextResponse.json({ url: trip.kanban_background_url, existing: true });
  }

  const url = await fetchDestinationPhoto(trip.destination);
  if (!url) return NextResponse.json({ url: null });

  await supabase
    .from("trips")
    .update({ kanban_background_url: url })
    .eq("id", tripId);

  return NextResponse.json({ url });
}
