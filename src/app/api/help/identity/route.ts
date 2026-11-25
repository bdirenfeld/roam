import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { signFeaturebaseJwt } from "@/lib/help/featurebaseJwt";

export const dynamic = "force-dynamic";

/**
 * The signed-in person's identity for the Featurebase messenger. `jwt: null`
 * until FEATUREBASE_JWT_SECRET is set in Vercel (or for an account with no
 * email): Help then stays on Roam's own chat, so nothing breaks in between.
 */
export async function GET() {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const secret = process.env.FEATUREBASE_JWT_SECRET;
  if (!secret || !gate.user.email) return NextResponse.json({ jwt: null });
  const { data } = await createAdminClient().from("users").select("name").eq("id", gate.user.id).maybeSingle();
  return NextResponse.json({ jwt: signFeaturebaseJwt({ userId: gate.user.id, email: gate.user.email, name: data?.name ?? null }, secret) });
}
