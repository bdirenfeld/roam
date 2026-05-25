import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

// Creates a Stripe Checkout session for the signed-in user and 303-redirects
// to Stripe-hosted Checkout. Reached either via the middleware payment gate
// or the cancel page's "try again" link.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Already paid → skip Checkout entirely.
  const { data: profile } = await supabase
    .from("users")
    .select("has_paid")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.has_paid) {
    return NextResponse.redirect(new URL("/trips", origin));
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // client_reference_id is the purpose-built field for tying a Checkout
    // session back to our auth uid — the webhook reads it to flip has_paid.
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 100,
          product_data: {
            name: "Roam — early access",
          },
        },
      },
    ],
    success_url: `${origin}/trips`,
    cancel_url: `${origin}/checkout/cancelled`,
  });

  if (!session.url) {
    return NextResponse.redirect(new URL("/checkout/cancelled", origin));
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
