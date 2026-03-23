"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// NEXT_PUBLIC_SITE_URL should be set in Vercel env vars (e.g. https://roam-roan.vercel.app).
// Fall back to VERCEL_URL (auto-provided by Vercel, no protocol) for preview deployments,
// then localhost for local dev.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signInWithGoogle(next?: string) {
  const supabase = await createClient();

  // Store `next` in a short-lived cookie instead of embedding it in the redirectTo
  // URL. Supabase requires an exact allowlist match on redirectTo — any query param
  // (like ?next=/) causes it to fall back to the Site URL and the code never reaches
  // /auth/callback. The cookie survives the OAuth round-trip cleanly.
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    const cookieStore = await cookies();
    cookieStore.set("auth_redirect_next", next, {
      path: "/",
      maxAge: 60 * 10, // 10 minutes — enough for the OAuth round-trip
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // Clean URL with no query params — add exactly this to Supabase → Auth → Redirect URLs:
  // https://roam-roan.vercel.app/auth/callback
  const redirectTo = `${SITE_URL}/auth/callback`;

  const { data } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
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
