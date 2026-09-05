// ── Who may call a route that spends money, and how often ─────────────────
// Every API route that calls Claude, Google or Mapbox goes through these two:
//   const gate = await requireUser();            if ("response" in gate) return gate.response;
//   const ok   = await underQuota(gate.supabase, "find-prices", 20);  if (!ok) return quotaExceeded();
// The count lives in public.api_usage (one row per user, route and UTC day)
// behind a SECURITY DEFINER function, so nothing on the client can reset it.
// Scale audit, Sept 2026: five spending routes answered anyone on the
// internet, and none of the signed-in ones counted calls.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type Gate =
  | { supabase: SupabaseClient; user: User }
  | { response: NextResponse };

/** The signed-in user, or the 401 to return. */
export async function requireUser(): Promise<Gate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  return { supabase, user };
}

/**
 * Count this call against today's limit for the route. Returns false once
 * the caller is over. Fails OPEN on a database error — a broken counter
 * should never take the feature down — but logs it.
 */
export async function underQuota(supabase: SupabaseClient, route: string, dailyLimit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("bump_api_usage", { p_route: route, p_limit: dailyLimit });
  if (error) {
    console.error("[Roam] quota check failed:", route, error.message);
    return true;
  }
  return data !== false;
}

/** The 429 every route returns when a user is over for the day. */
export function quotaExceeded(what = "that"): NextResponse {
  return NextResponse.json(
    { error: `You've used today's allowance for ${what}. It resets at midnight UTC.` },
    { status: 429 },
  );
}

// Daily allowances. Generous for a family planning a trip, tight for a loop.
export const QUOTA = {
  assistant:     150,  // chat turns
  entryCheck:     20,  // web-searching Claude calls
  findPrices:     20,
  parseBooking:   60,  // Claude reading a PDF or image
  uploadAttachment: 120,
  placeSearch:   600,  // Google autocomplete keystroke sessions
  placeDetails:  300,
  foodEnrich:    300,
  bulkImport:     20,
  coverPhoto:     40,  // Unsplash
} as const;
