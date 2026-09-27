import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuthUser { id: string; email: string | null }

/**
 * The signed-in user on the server, verified locally (26 Sep 2026).
 *
 * `auth.getUser()` is a network round trip to Supabase Auth, and the app made
 * three or more per page (middleware, the page, getTripAccess). On 27 Sep
 * 02:20 UTC Auth's /user slowed to 4–13 s with 504s while the database sat
 * idle, and every page took 5–25 s. `getClaims()` checks the session token's
 * signature against the project's ES256 key (JWKS, cached) with no round
 * trip, and still refreshes an expired session. Row-level security still
 * runs on every query with the same token, so this decides nothing the
 * database does not check again.
 *
 * Use getUser() only where the full profile is needed (Profile, invites,
 * checkout read user_metadata or a verified email).
 */
export async function getAuthUser(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || typeof sub !== "string" || !sub) return null;
  const email = data?.claims?.email;
  return { id: sub, email: typeof email === "string" ? email : null };
}
