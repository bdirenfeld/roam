import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ShareCatchClient from "@/components/trip/ShareCatchClient";
import type { JourneySummary } from "@/components/trip/PromoteToWishlistSheet";

interface Props {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}

/**
 * Where Android drops anything shared to Roam.
 *
 * Declared in the manifest as a share_target, so once the app is installed to
 * the home screen it appears in the system share sheet — TikTok, Instagram,
 * Reddit, Chrome. Apps pass what they feel like: a URL, a caption, sometimes
 * only text with a link buried in it. Take whatever turns up and sort it out.
 */
export default async function SharePage({ searchParams }: Props) {
  const { title, text, url } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Some apps put the link in `text` rather than `url`.
  const link = url || text?.match(/https?:\/\/\S+/)?.[0] || null;
  const caption = title || (text && text !== link ? text : null) || null;
  let source: string | null = null;
  try {
    if (link) source = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    source = null;
  }

  // Saved on arrival, before any interaction. The point of the feature is
  // catching something mid-scroll; making the save conditional on finishing a
  // form would lose exactly the ones worth keeping.
  const { data: idea } = await supabase
    .from("ideas")
    .insert({
      user_id: user.id,
      url: link,
      title: caption,
      source,
      status: "inbox",
    })
    .select("id")
    .single();

  // Tags already in use, most-used first. Reusing one is a tap; the point is
  // that tagging happens now, while you still remember why you saved it.
  const { data: tagged } = await supabase
    .from("ideas")
    .select("tags")
    .eq("user_id", user.id);
  const counts = new Map<string, number>();
  for (const row of tagged ?? []) {
    for (const t of (row.tags ?? []) as string[]) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  // Journeys, so a place named here can go straight onto one without a detour
  // through the Ideas list to find the thing you just saved.
  const { data: trips } = await supabase
    .from("trips")
    .select("id, title, destination, destination_lat, destination_lng, end_date, archived")
    .eq("user_id", user.id)
    // Archived stays — a shelved journey is still one you might be collecting
    // for. Finished does not: you cannot add a restaurant to a trip you have
    // already taken.
    .gte("end_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: true });

  const knownTags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);

  return (
    <ShareCatchClient
      ideaId={idea?.id ?? null}
      title={caption}
      link={link}
      source={source}
      knownTags={knownTags}
      journeys={(trips ?? []) as JourneySummary[]}
    />
  );
}
