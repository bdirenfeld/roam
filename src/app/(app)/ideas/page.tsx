import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import IdeasClient, { type Idea } from "@/components/trip/IdeasClient";
import type { JourneySummary } from "@/components/trip/PromoteToWishlistSheet";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string }> | { from?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `?from=<tripId>` is set by the journey menu's Ideas row. Resolve it to a
  // title so the page can say "‹ Tuscany" rather than "‹ Journeys".
  const sp = (await searchParams) ?? {};
  const fromId = typeof sp.from === "string" && /^[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null;
  const { data: fromTrip } = fromId
    ? await supabase.from("trips").select("id, title").eq("id", fromId).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const backTo = fromTrip ? { href: `/trips/${fromTrip.id}`, title: fromTrip.title ?? "Journey" } : null;

  const [{ data: ideas }, { data: trips }] = await Promise.all([
    supabase
      .from("ideas")
      .select(
        "id, url, title, note, source, status, tags, created_at, wishlist_destination_id, pins_added, pinned_trip_id, place"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Every journey, archived included: a shelved journey is still somewhere
    // you might be collecting places for, and deciding otherwise for Brennan
    // just means he cannot do the thing he asked for. The sheet labels the
    // shelved ones and offers the live ones first.
    supabase
      .from("trips")
      .select("id, title, destination, destination_lat, destination_lng, end_date, archived")
      .eq("user_id", user.id)
      // Archived stays — a shelved journey is still one you might be collecting
      // for. Finished does not: you cannot add a restaurant to a trip you have
      // already taken.
      .gte("end_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true }),
  ]);

  return (
    <IdeasClient
      initial={(ideas ?? []) as Idea[]}
      journeys={(trips ?? []) as JourneySummary[]}
      backTo={backTo}
    />
  );
}
