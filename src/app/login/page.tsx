import { redirect } from "next/navigation";

// /login is retired — the marketing page at / is now the only front door.
// This redirect keeps stale bookmarks and existing OAuth-error / sign-out /
// checkout redirects (which still target /login) landing on /.
//
// IMPORTANT: /login must stay in the middleware `publicPaths` allowlist. It is
// gate-exempt so a signed-in-but-unpaid visitor arriving here can bounce to /
// (and on to /checkout via the page's own logic) without the has_paid gate
// catching the /login hop into a redirect loop.
export default function LoginRedirect() {
  redirect("/");
}
