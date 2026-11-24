import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { getAuthUser } from "@/lib/supabase/authUser";

// Stripe sends the traveller here after paying (checkout/route.ts success_url).
// The webhook also marks the account paid, but it can arrive after the
// traveller does; landing on the paywall they just paid for is the worst
// moment to be wrong. So: ask Stripe about this session, and if it is paid
// and belongs to the signed-in person, mark them paid now. Idempotent with
// the webhook (both upsert has_paid = true).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const sessionId = url.searchParams.get("session_id");

  const user = await getAuthUser(await createClient());
  if (!user) return NextResponse.redirect(new URL("/login", origin));

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" && session.client_reference_id === user.id) {
        const { error } = await createAdminClient()
          .from("users")
          .upsert({ id: user.id, has_paid: true }, { onConflict: "id" });
        if (error) console.error("[checkout/success] users upsert failed:", error.message);
      }
    } catch (err) {
      // The webhook still lands; the worst case is the old race, not a lost payment.
      console.error("[checkout/success] session lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  // Straight back to what they were doing when they hit the paywall.
  return NextResponse.redirect(new URL("/trips/new", origin));
}
