"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// NEXT_PUBLIC_SITE_URL should be set in Vercel env vars (e.g. https://roam-roan.vercel.app).
// Fall back to VERCEL_URL (auto-provided by Vercel, no protocol) for preview deployments,
// then localhost for local dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function signInWithGoogle(next?: string) {
  const supabase = await createClient();

  const redirectTo = new URL("/auth/callback", SITE_URL);
  if (next) redirectTo.searchParams.set("next", next);

  const { data } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo.toString() },
  });

  if (data.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
