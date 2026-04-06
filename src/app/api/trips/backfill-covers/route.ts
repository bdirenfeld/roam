import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/types/database";

export async function POST() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "UNSPLASH_ACCESS_KEY not configured" },
      { status: 500 },
    );
  }

  const supabase = await createClient();

  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, destination")
    .not("destination", "is", null)
    .is("cover_image_url", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = (trips ?? []) as Pick<Trip, "id" | "destination">[];
  if (eligible.length === 0) {
    return NextResponse.json({ updated: 0, skipped: 0, results: [] });
  }

  const results: { id: string; destination: string; url: string | null }[] = [];

  for (const trip of eligible) {
    let url: string | null = null;
    try {
      const query = encodeURIComponent(`${trip.destination} landmark`);
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${query}&per_page=1&orientation=landscape`,
        {
          headers: { Authorization: `Client-ID ${key}` },
          next: { revalidate: 0 },
        },
      );
      if (res.ok) {
        const data = await res.json() as { results?: { urls?: { regular?: string } }[] };
        url = data.results?.[0]?.urls?.regular ?? null;
      }
    } catch {
      // leave url as null
    }

    if (url) {
      await supabase
        .from("trips")
        .update({ cover_image_url: url })
        .eq("id", trip.id);
    }

    results.push({ id: trip.id, destination: trip.destination!, url });
  }

  const updated = results.filter((r) => r.url !== null).length;
  const skipped = results.filter((r) => r.url === null).length;

  return NextResponse.json({ updated, skipped, results });
}
