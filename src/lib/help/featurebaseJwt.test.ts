import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { IDENTITY_SECONDS, signFeaturebaseJwt } from "./featurebaseJwt";

const parts = (t: string) => t.split(".");
const json = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

describe("the identity Featurebase is given", () => {
  const t = signFeaturebaseJwt({ userId: "u1", email: "sam@example.com", name: "Sam" }, "secret", 1_800_000_000_000);
  it("is an HS256 token naming the person, good for a week", () => {
    const [h, p] = parts(t);
    expect(json(h)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(json(p)).toEqual({ userId: "u1", email: "sam@example.com", name: "Sam", iat: 1_800_000_000, exp: 1_800_000_000 + IDENTITY_SECONDS });
  });
  it("is signed with the secret, so a changed name or a wrong secret does not verify", () => {
    const [h, p, s] = parts(t);
    expect(s).toBe(createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url"));
    expect(parts(signFeaturebaseJwt({ userId: "u1", email: "sam@example.com", name: "Sam" }, "other", 1_800_000_000_000))[2]).not.toBe(s);
    expect(parts(signFeaturebaseJwt({ userId: "u2", email: "sam@example.com", name: "Sam" }, "secret", 1_800_000_000_000))[2]).not.toBe(s);
  });
  it("leaves the name out when there is none", () => {
    expect("name" in json(parts(signFeaturebaseJwt({ userId: "u1", email: "a@b.c", name: null }, "s"))[1])).toBe(false);
  });
});
