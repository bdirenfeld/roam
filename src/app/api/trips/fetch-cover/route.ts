import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAndStoreCover } from "@/lib/unsplash";

export async function POST(request: NextRequest) {
  const body = await request.json() as { trip_id?: string };
  const tripId = body.trip_id;
  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("destination")
    .eq("id", tripId)
    .single();

  if (!trip?.destination) {
    return NextResponse.json({ url: null });
  }

  const url = await fetchAndStoreCover(supabase, tripId, trip.destination);
  return NextResponse.json({ url });
}
