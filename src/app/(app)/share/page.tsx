import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ShareCatchClient from "@/components/trip/ShareCatchClient";
import { isHouseholdOwner } from "@/lib/household";
import type { ShareJourney } from "@/lib/share/journeys";

interface Props {
  searchParams: Promise<{ title?: string; text?: string; url?: string; choose?: string }>;
}

/**
 * Where Android drops anything shared to Roam.
 *
 * Declared in the manifest as a share_target, so once the app is installed to
 * the home screen it appears in the system share sheet — TikTok, Instagram,
 * Chrome. Apps pass what they feel like: a URL, a caption, sometimes only text
 * with a link buried in it.
 *
 * Since 26 Sep 2026 a share goes straight onto a journey's map (or the
 * Wishlist) — no Ideas list in between. Nothing is written until a place is
 * picked. `choose` is a Google place id: Undo on the map sends you back here
 * with it, straight to the list of where it can go.
 */
export default async function SharePage({ searchParams }: Props) {
  const { title, text, url, choose } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Some apps put the link in `text` rather than `url`.
  const link = url || text?.match(/https?:\/\/\S+/)?.[0] || null;
  const caption = title || (text && text !== link ? text : null) || null;

  // Journeys still ahead — archived included, because Brennan archives the
  // ones he is holding (Santa Barbara, three weeks out). A finished journey is
  // not somewhere to put a restaurant.
  const today = new Date().toISOString().slice(0, 10);
  const { data: trips } = await supabase
    .from("trips")
    .select("id, title, destination_lat, destination_lng, archived")
    .eq("user_id", user.id)
    .gte("end_date", today)
    .order("start_date", { ascending: true });

  // Every pin's coordinates, so "near" means near anything on the journey and
  // not only its one destination point.
  const ids = (trips ?? []).map((t) => t.id as string);
  const { data: pins } = ids.length
    ? await supabase
        .from("cards")
        .select("trip_id, place:places(lat, lng)")
        .in("trip_id", ids)
        .not("place_id", "is", null)
    : { data: [] };

  const points = new Map<string, [number, number][]>();
  for (const t of trips ?? []) {
    points.set(
      t.id as string,
      t.destination_lat != null && t.destination_lng != null
        ? [[t.destination_lat as number, t.destination_lng as number]]
        : [],
    );
  }
  for (const row of (pins ?? []) as unknown as { trip_id: string; place: { lat: number | null; lng: number | null } | null }[]) {
    if (row.place?.lat != null && row.place.lng != null) {
      points.get(row.trip_id)?.push([row.place.lat, row.place.lng]);
    }
  }

  const journeys: ShareJourney[] = (trips ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    archived: t.archived === true,
    points: points.get(t.id as string) ?? [],
  }));

  return (
    <ShareCatchClient
      link={link}
      caption={caption}
      journeys={journeys}
      // The Wishlist lives inside Your year, which only the household owner
      // sees — anyone else would be saving into a list they cannot open.
      wishlist={isHouseholdOwner(user.id)}
      choose={choose ?? null}
    />
  );
}
