import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import ClaimSignIn from "./ClaimSignIn";
import SharedItinerary, { type SharedCard, type SharedDay } from "./SharedItinerary";
import { cachedPhotoUrl } from "@/lib/places/photoCache";
import { agendaOrder } from "@/lib/agendaOrder";
import { cardTimes } from "@/lib/cardTime";

// Rendered per request, never cached: opening the link always shows the plan
// as it stands right now.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

// Editorial dead-end for a token that resolves to nothing. Deliberately
// reveals nothing about whether a trip exists — same calm screen for a
// bad token, a rotated token, or a withdrawn link. No stack trace.
function InvitationUnavailable() {
  return (
    <main
      style={{ minHeight: "100dvh", background: "#F5F4F1" }}
      className="flex flex-col items-center justify-center px-8 text-center"
    >
      <p
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "rgba(26,26,46,0.5)" }}
      >
        Roam
      </p>
      <h1
        className="font-display italic mt-3 text-[26px]"
        style={{ color: "#1A1A2E", letterSpacing: "-0.01em" }}
      >
        This invitation isn&apos;t available
      </h1>
      <p
        className="mt-3 max-w-[34ch] text-[14px] leading-[1.6]"
        style={{ color: "rgba(26,26,46,0.62)" }}
      >
        The link may have been withdrawn, or it was never quite right. Ask your
        host to share it again.
      </p>
    </main>
  );
}

// Claim route. A guest taps a host's share link; this writes a durable
// trip_members row keyed to their account, then drops them into the Day view.
// Access from then on is governed by RLS — the link is a one-time claim, not
// the access mechanism.
export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  const shareToken = token?.trim();
  if (!shareToken) return <InvitationUnavailable />;

  // Auth via the user's RLS client. Unauthenticated → hand off to the client
  // sign-in arm, which kicks off Google OAuth carrying this path as `next`.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // No account needed to READ. The link is the secret and holding it is the
    // permission; the people a journey was planned for should not have to
    // make a Google account to look at it (Brennan, Sept 2026). Signing in is
    // still offered, for anyone who wants to be a name on it and add to it.
    const admin = createAdminClient();
    const { data: t } = await admin
      .from("trips")
      .select("id, title, destination, start_date, end_date, cover_image_url, user_id")
      .eq("share_token", shareToken)
      .maybeSingle();
    if (!t) return <ClaimSignIn token={shareToken} invite={null} />;

    let host: string | null = null;
    if (t.user_id) {
      const { data: u } = await admin.from("users").select("name").eq("id", t.user_id).maybeSingle();
      host = (u?.name as string | null) ?? null;
    }

    // `day_name`, not `title` — the live schema is the source of truth and a
    // wrong column makes PostgREST return an error with null data, which
    // renders as a journey with no days at all (caught in review, Sept 2026).
    const [{ data: dayRows, error: dayErr }, { data: cardRows, error: cardErr }] = await Promise.all([
      admin.from("days").select("id, date, day_number, day_name").eq("trip_id", t.id).order("day_number"),
      admin
        .from("cards")
        .select("id, day_id, start_time, end_time, position, details, place:places ( title, sub_type, address, photo_cache )")
        .eq("trip_id", t.id)
        .eq("status", "in_itinerary"),
    ]);

    if (dayErr || cardErr) {
      // Never show an empty-looking journey because a query failed.
      console.error("[Roam] shared itinerary read failed:", dayErr?.message ?? cardErr?.message);
    }

    const days: SharedDay[] = (dayRows ?? []).map((d) => ({
      id: d.id as string,
      date: d.date as string,
      dayNumber: d.day_number as number,
      title: (d.day_name as string | null) ?? null,
    }));

    type Row = {
      id: string; day_id: string | null; start_time: string | null; end_time: string | null;
      position: number | null; details: Record<string, unknown> | null;
      place: { title: string | null; sub_type: string | null; address: string | null; photo_cache: unknown } | null;
    };
    const cards: SharedCard[] = ((cardRows ?? []) as unknown as Row[])
      // The same rule the owner's agenda uses, from the same function. Sorting
      // on raw start_time here put Rome's overnight flight at the bottom of the
      // day it lands on for every guest, while the owner saw it at the top.
      .sort(agendaOrder)
      .map((c) => ({
        id: c.id,
        dayId: c.day_id,
        // Shown at the time it happens, for the same reason it is SORTED at
        // the time it happens. Reading start_time here while ordering by
        // cardTimes would put Rome's flight first and then label it 7:45 PM —
        // the takeoff — which reads worse than the bug it replaced.
        ...cardTimes(c),
        noteTitle: typeof c.details?.title === "string" ? (c.details.title as string) : null,
        place: c.place
          ? {
              title: c.place.title,
              sub_type: c.place.sub_type,
              address: c.place.address,
              // Only an already-cached copy: /api/places/photo needs a session.
              photo: cachedPhotoUrl(c.place.photo_cache, 0, "thumb"),
            }
          : null,
      }));

    return (
      <SharedItinerary
        token={shareToken}
        journey={{
          title: t.title as string,
          destination: (t.destination as string | null) ?? null,
          startDate: (t.start_date as string | null) ?? null,
          endDate: (t.end_date as string | null) ?? null,
          cover: (t.cover_image_url as string | null) ?? null,
          host,
          days,
          cards,
        }}
      />
    );
  }

  // Token lookup runs through service-role — a not-yet-member guest cannot
  // read the trip under RLS, so RLS can't resolve the invite. This is a
  // brief-sanctioned admin use: the caller is verified (user_id comes from the
  // server session, never the request) and the only write is their own
  // membership against a token they hold.
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id, user_id")
    .eq("share_token", shareToken)
    .maybeSingle();

  if (!trip) return <InvitationUnavailable />;

  // Durable membership — idempotent (ON CONFLICT DO NOTHING via the
  // (trip_id, user_id) unique). Re-tapping the link is a no-op. The owner
  // claiming their own link needs no guest row.
  if (trip.user_id !== user.id) {
    await admin.from("trip_members").upsert(
      { trip_id: trip.id, user_id: user.id, role: "guest" },
      { onConflict: "trip_id,user_id", ignoreDuplicates: true },
    );
  }

  // Land in the Day view on today's day, clamped to the journey range; if the
  // journey has no days yet, fall back to the trip root (which resolves it
  // itself). The shared resolver is the single source of that choice.
  const { data: days } = await admin
    .from("days")
    .select("id, date")
    .eq("trip_id", trip.id)
    .order("day_number", { ascending: true });

  const openDay = resolveDefaultDay(days ?? []);

  redirect(
    openDay ? `/trips/${trip.id}/days/${openDay.id}` : `/trips/${trip.id}`,
  );
}
