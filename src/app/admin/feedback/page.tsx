import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/authUser";
import { isAdmin } from "@/lib/adminView";
import { conversations, type HelpRow } from "@/lib/help/message";
import { SAMPLE_NAME, SAMPLE_TITLE } from "@/lib/sampleTrip/itinerary";
import FeedbackInbox, { type InboxItem } from "@/components/help/FeedbackInbox";

export const dynamic = "force-dynamic";

/** What people wrote, and Brennan's answers. Admin only: anyone else gets a 404. */
export default async function FeedbackPage() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!isAdmin(user?.id)) notFound();
  const db = createAdminClient();
  const { data, error } = await db.from("help_messages").select("id, user_id, trip_id, from_admin, body, picture_path, context, read_at, created_at").order("created_at", { ascending: false }).limit(1000);
  const convs = conversations((data ?? []) as HelpRow[]).slice(0, 200);
  const ids = convs.map((c) => c.userId);
  const { data: people } = ids.length ? await db.from("users").select("id, name, email").in("id", ids) : { data: [] };
  const tripIds = Array.from(new Set(convs.map((c) => c.tripId).filter((t): t is string => !!t)));
  const { data: trips } = tripIds.length ? await db.from("trips").select("id, title").in("id", tripIds) : { data: [] };
  const journey = (id: string | null) => { const t = (trips ?? []).find((x) => x.id === id)?.title; return t ? (t === SAMPLE_TITLE ? SAMPLE_NAME + " (the example)" : t) : null; };
  const paths = convs.flatMap((c) => c.rows.map((r) => r.picture_path).filter((p): p is string => !!p));
  const { data: signed } = paths.length ? await db.storage.from("help-pictures").createSignedUrls(paths, 3600) : { data: [] };
  const url: Record<string, string> = {};
  (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) url[s.path] = s.signedUrl; });
  const items: InboxItem[] = convs.map((c) => {
    const p = (people ?? []).find((x) => x.id === c.userId);
    return {
      key: c.key, tripId: c.tripId, journey: journey(c.tripId), userId: c.userId, who: p?.name || p?.email || "Someone", email: p?.email ?? null, waiting: c.waiting, urgent: c.urgent,
      rows: c.rows.map((r) => ({ id: r.id, mine: r.from_admin, body: r.body, at: r.created_at, read: !!r.read_at, picture: r.picture_path ? url[r.picture_path] ?? null : null, context: (r.context ?? {}) as Record<string, unknown> })),
    };
  });
  return (
    <main className="min-h-screen bg-white">
      <div className="sticky top-0 z-20 h-14 flex items-center gap-3.5 px-4 md:px-7" style={{ background: "#1A1A2E", color: "#fff" }}>
        <a href="/trips" className="font-display text-[21px]">Roam</a>
        <a href="/admin" className="text-[13px] underline underline-offset-4">Journeys</a>
        <span className="text-[13px]">Feedback</span>
      </div>
      {error ? <p className="p-7 text-[14px]" style={{ color: "#B0541F" }}>Couldn&apos;t load the messages. Try again.</p> : <FeedbackInbox items={items} />}
    </main>
  );
}
