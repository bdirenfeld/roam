import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import ClaimSignIn from "./ClaimSignIn";

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
    // Before sign-in the page names what it is inviting you to: the journey,
    // its dates, who sent it, its cover. The token is the invitation, so
    // showing its title to the holder gives nothing away that the link
    // itself did not (Brennan, Sep 2026: the page was anonymous).
    const admin = createAdminClient();
    const { data: t } = await admin
      .from("trips")
      .select("title, destination, start_date, end_date, cover_image_url, user_id")
      .eq("share_token", shareToken)
      .maybeSingle();
    let host: string | null = null;
    if (t?.user_id) {
      const { data: u } = await admin.from("users").select("name").eq("id", t.user_id).maybeSingle();
      host = (u?.name as string | null) ?? null;
    }
    return (
      <ClaimSignIn
        token={shareToken}
        invite={t ? {
          title: t.title as string,
          destination: (t.destination as string | null) ?? null,
          startDate: (t.start_date as string | null) ?? null,
          endDate: (t.end_date as string | null) ?? null,
          cover: (t.cover_image_url as string | null) ?? null,
          host,
        } : null}
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
