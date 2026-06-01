import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      style={{ minHeight: "100dvh", background: "#FAF7F2" }}
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
        style={{ color: "rgba(26,26,46,0.55)" }}
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
  if (!user) return <ClaimSignIn token={shareToken} />;

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

  // Land in the Day view — first day if present, else the trip root (which
  // resolves the first day itself).
  const { data: firstDay } = await admin
    .from("days")
    .select("id")
    .eq("trip_id", trip.id)
    .order("day_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  redirect(
    firstDay ? `/trips/${trip.id}/days/${firstDay.id}` : `/trips/${trip.id}`,
  );
}
