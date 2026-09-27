import type { JWK } from "@supabase/supabase-js";

/**
 * The project's public signing key, shipped with the app (27 Sep 2026).
 * getClaims fetched it from Supabase Auth on every cold server start and on
 * every page load in the browser — the same Auth that was slow all day, and
 * up to 2 s of a page that opened in 8. It is public, and the library falls
 * back to fetching when a token names a key that is not here, so a rotation
 * costs one fetch, not a sign-out.
 */
export const PROJECT_JWKS: { keys: JWK[] } = {
  keys: [
    {
      alg: "ES256", crv: "P-256", ext: true, key_ops: ["verify"], kid: "7b1790e8-825d-49bb-9493-8d7c152b765b",
      kty: "EC", use: "sig", x: "MrPV2-lIbAaqR7gBFCl1LU5vetFmeL4LvpAk7t5rNyA", y: "kxjycWMsMMpBRuMe31u7uu-6t1v74PghdZY_AUxycrI",
    } as JWK,
  ],
};
