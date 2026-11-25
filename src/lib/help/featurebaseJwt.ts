// Who is writing, signed for Featurebase (24 Nov 2026). Server only: the
// secret is FEATUREBASE_JWT_SECRET in Vercel and never reaches the browser.
// Featurebase checks the signature, so nobody can open someone else's
// conversations by typing their email. HS256 by hand: no new dependency.
import { createHmac } from "crypto";

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export interface HelpIdentity { userId: string; email: string; name?: string | null }

/** Seven days: long enough for a session, short enough that a leaked token dies. */
export const IDENTITY_SECONDS = 7 * 24 * 60 * 60;

export function signFeaturebaseJwt(who: HelpIdentity, secret: string, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: Record<string, unknown> = { userId: who.userId, email: who.email, iat, exp: iat + IDENTITY_SECONDS };
  if (who.name) payload.name = who.name;
  const body = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
