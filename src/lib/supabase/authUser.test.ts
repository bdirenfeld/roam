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
