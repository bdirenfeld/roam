import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config.mjs";

// The short links in next.config.mjs (8 Oct 2026). Each one is printed in a
// bio or a post, so a typo here sends real visitors to the wrong place.
describe("short links", () => {
  it("tag each channel and land on the home page", async () => {
    const rules = await nextConfig.redirects!();
    const map = Object.fromEntries(rules.map((r) => [r.source, r.destination]));
    expect(map).toEqual({
      "/ig": "/?utm_source=instagram",
      "/reddit": "/?utm_source=reddit",
      "/beta": "/?utm_source=betalist",
    });
    for (const r of rules) expect(r.permanent).toBe(false);
  });
});
