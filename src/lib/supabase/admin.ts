// ⚠️ ADMIN / SERVICE-ROLE Supabase client — BYPASSES RLS.
//
// This client uses SUPABASE_SERVICE_ROLE_KEY and ignores Row Level Security.
// It must ONLY be imported by server-side, non-user-facing code that has
// independently verified the authenticity of its caller — today, that means
// the Stripe webhook at /api/stripe/webhook (signature-verified by Stripe).
//
// NEVER import this from:
//   - any client component ("use client")
//   - any route or server action triggered by a user request
//   - any module reachable from a NEXT_PUBLIC_* boundary
//
// Doing so would let an authenticated user read or mutate any other user's
// data, defeating the entire RLS model.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
