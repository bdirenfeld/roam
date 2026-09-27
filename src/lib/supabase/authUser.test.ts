import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthUser } from "./authUser";

const client = (result: unknown) => {
  const getClaims = vi.fn().mockResolvedValue(result);
  const getUser = vi.fn();
  return { c: { auth: { getClaims, getUser } } as unknown as SupabaseClient, getClaims, getUser };
};

describe("getAuthUser", () => {
  it("reads the user from the verified token without calling Supabase Auth", async () => {
    const { c, getUser } = client({ data: { claims: { sub: "u-1", email: "b@example.com" } }, error: null });
    expect(await getAuthUser(c)).toEqual({ id: "u-1", email: "b@example.com" });
    expect(getUser).not.toHaveBeenCalled();
  });
  it("is null when there is no session or the token fails verification", async () => {
    expect(await getAuthUser(client({ data: null, error: null }).c)).toBeNull();
    expect(await getAuthUser(client({ data: { claims: { sub: "u-1" } }, error: new Error("bad signature") }).c)).toBeNull();
    expect(await getAuthUser(client({ data: { claims: {} }, error: null }).c)).toBeNull();
  });
});

// 27 Sep 2026: every photo, every Add and every page asked Supabase Auth who
// was signed in, at 1.7-13 s a question while Auth was slow. Only the screens
// that need the full profile (user_metadata or a verified email) may ask.
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
const ALLOWED = new Set([
  "src/app/(app)/profile/page.tsx",
  "src/components/profile/ProfileForm.tsx",
  "src/app/api/share/send-invite/route.ts",
  "src/app/checkout/route.ts",
]);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n).split("\\").join("/");
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}
describe("who is signed in, without a round trip", () => {
  it("only the profile, invites and checkout call auth.getUser()", () => {
    const callers = [...walk("src/app"), ...walk("src/components"), ...walk("src/lib")]
      .filter((f) => /auth\.getUser\(\)/.test(readFileSync(f, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")));
    expect(callers.filter((f) => !ALLOWED.has(f)), "use getAuthUser (lib/supabase/authUser)").toEqual([]);
  });
});
