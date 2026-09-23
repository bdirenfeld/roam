import { redirect } from "next/navigation";

// /login is retired — the marketing page at / is now the only front door.
// This redirect keeps stale bookmarks and existing OAuth-error / sign-out /
// checkout redirects (which still target /login) landing on /.
//
// A failed sign-in used to be redirected here with ?error=… and then bounced
// to / with the error thrown away, so a person whose emailed link had expired
// landed on the home page with no word about what happened (audit, 23 Sep
// 2026). The failure now rides through as ?signin=failed and the landing page
// says so.
//
// IMPORTANT: /login must stay in the middleware `publicPaths` allowlist. It is
// gate-exempt so a signed-in-but-unpaid visitor arriving here can bounce to /
// (and on to /trips) — there is no has_paid gate; see lib/supabase/middleware.ts
// catching the /login hop into a redirect loop.
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  redirect(error ? "/?signin=failed" : "/");
}
