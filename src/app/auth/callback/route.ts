import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const next = searchParams.get("next") ?? "/trips";

  // OAuth provider returned an error (e.g. user denied permission)
  if (error) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "no_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.user) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  // Upsert user profile — safe to call every login; only updates changed fields
  const { error: upsertError } = await supabase.from("users").upsert(
    {
      id: data.user.id,
      email: data.user.email!,
      name: data.user.user_metadata?.full_name ?? null,
      avatar_url: data.user.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" }
  );

  // Upsert failure means the schema isn't set up yet — still let the user in,
  // they'll just see empty data. Logged for debugging.
  if (upsertError) {
    console.error("[auth/callback] users upsert failed:", upsertError.message);
  }

  // Validate `next` to prevent open-redirect abuse — must be a relative path
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
