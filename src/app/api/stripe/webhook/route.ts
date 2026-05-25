import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook receiver. Called by Stripe directly with no user session, so
// it must remain reachable unauthenticated (see middleware publicPaths) and
// exempt from the payment gate (handled implicitly — gate skips all /api/*).
//
// Body handling: App Router route handlers do NOT pre-parse the body, so
// `await req.text()` yields the exact raw payload Stripe signed. Never call
// `req.json()` first, and never add a Pages-Router `bodyParser` config — it
// has no effect here and would only mask the real failure mode.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("webhook secret not configured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new NextResponse("missing stripe-signature header", { status: 400 });
  }

  const rawBody = await req.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new NextResponse(`signature verification failed: ${message}`, {
      status: 400,
    });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.client_reference_id;

  if (!userId) {
    // No auth uid to target — refuse rather than write a row blind.
    return new NextResponse("missing client_reference_id", { status: 400 });
  }

  // UPSERT on id — there is no signup trigger, so the row may or may not
  // exist. Live schema: only id and has_paid are NOT NULL on public.users;
  // every other column is nullable or has a default, so this minimal payload
  // is sufficient whether we hit an existing row or insert a new one.
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .upsert({ id: userId, has_paid: true }, { onConflict: "id" });

  if (error) {
    console.error("[stripe/webhook] users upsert failed:", error.message);
    return new NextResponse("upsert failed", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
