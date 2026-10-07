// ── The phone preview never exists outside `next dev` ─────────────────────
// /dev/phone/[screen] renders real components over fixture data so a phone
// screen can be looked at without a phone or an account. On the live site it
// must be a 404, and its fixtures must never be served to anyone:
//
// - the page calls `notFound()` unless this returns true (NODE_ENV is inlined
//   at build time, so a production build has the constant `false` here);
// - src/middleware.ts lets /dev/ past the sign-in check only in development,
//   so in production the path is behind sign-in AND a 404.
//
// devOnly.test.ts checks both.

export const DEV_PREVIEW_PREFIX = "/dev/";

export function devPreviewAllowed(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === "development" || nodeEnv === "test";
}
