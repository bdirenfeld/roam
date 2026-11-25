import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const st = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null }));
vi.mock("@/lib/api/guard", () => ({ requireUser: () => Promise.resolve(st.user ? { user: st.user, supabase: {} } : { response: new Response("{}", { status: 401 }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: "Sam" } }) }) }) }) }) }));

import { GET } from "./route";

const payload = (t: string) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
beforeEach(() => { st.user = { id: "u1", email: "sam@example.com" }; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("who Featurebase is told you are", () => {
  it("needs a sign-in", async () => {
    st.user = null;
    vi.stubEnv("FEATUREBASE_JWT_SECRET", "s");
    expect((await GET()).status).toBe(401);
  });
  it("is nothing until the secret is set, so Help stays on Roam's own chat", async () => {
    vi.stubEnv("FEATUREBASE_JWT_SECRET", "");
    expect(await (await GET()).json()).toEqual({ jwt: null });
  });
  it("is nothing for an account with no email", async () => {
    vi.stubEnv("FEATUREBASE_JWT_SECRET", "s");
    st.user = { id: "u1", email: null };
    expect(await (await GET()).json()).toEqual({ jwt: null });
  });
  it("is the signed-in person, and only them", async () => {
    vi.stubEnv("FEATUREBASE_JWT_SECRET", "s");
    const { jwt } = await (await GET()).json();
    expect(payload(jwt)).toMatchObject({ userId: "u1", email: "sam@example.com", name: "Sam" });
  });
});
