import { describe, it, expect } from "vitest";
import { readRecommendedBy, isRecommended, recommendedByLine, recommendedLink, sameSite } from "./recommendedBy";

describe("recommendedBy", () => {
  it("reads a trimmed name", () => {
    expect(readRecommendedBy({ recommended_by: "  Gorav " })).toBe("Gorav");
  });
  it("treats blank, missing and non-string as no recommender", () => {
    for (const d of [null, undefined, "x", {}, { recommended_by: "" }, { recommended_by: "   " }, { recommended_by: 3 }]) {
      expect(readRecommendedBy(d)).toBeNull();
      expect(isRecommended(d)).toBe(false);
    }
  });
  it("isRecommended is true for a real name (the Recommended pill)", () => {
    expect(isRecommended({ recommended_by: "TikTok" })).toBe(true);
  });
  it("writes the one phrasing", () => {
    expect(recommendedByLine("Rita")).toBe("via Rita");
  });
});

// The links on his recommended cards, 16 Nov 2026: TikTok posts and Bourdain articles count; map picks do not.
describe("recommendedLink — back to what you saw", () => {
  it("a TikTok share link opens the post, named tiktok.com", () => {
    expect(recommendedLink("https://vt.tiktok.com/ZSabc123/")).toEqual({ url: "https://vt.tiktok.com/ZSabc123/", host: "tiktok.com" });
    expect(recommendedLink("https://www.tiktok.com/@x/video/1")?.host).toBe("tiktok.com");
  });
  it("an article counts", () => {
    expect(recommendedLink("https://eatlikebourdain.com/rome/")?.host).toBe("eatlikebourdain.com");
  });
  it("a Google Maps link is not what you saw", () => {
    expect(recommendedLink("https://maps.google.com/?cid=123")).toBeNull();
    expect(recommendedLink("https://www.google.com/maps/dir/?api=1&destination=x")).toBeNull();
    expect(recommendedLink("https://maps.app.goo.gl/abc")).toBeNull();
  });
  it("nothing, or not a web link, is nothing", () => {
    expect(recommendedLink(null)).toBeNull();
    expect(recommendedLink("javascript:alert(1)")).toBeNull();
    expect(recommendedLink("not a url")).toBeNull();
  });
});

describe("sameSite — the saved page and the website are one site (16 Nov 2026)", () => {
  it("My Tuscan Kitchen: the class page and the Google-listed site", () => {
    expect(sameSite("https://www.ariannandfriends.com/cooking-classes/?utm_source=googlemybusiness", "https://www.ariannandfriends.com/cooking-classes/pizza-dessert-cooking/")).toBe(true);
  });
  it("www. or not is the same site; different sites are not", () => {
    expect(sameSite("https://example.com/a", "https://www.example.com/b")).toBe(true);
    expect(sameSite("https://example.com", "https://vt.tiktok.com/x")).toBe(false);
  });
  it("missing or broken links are not the same site", () => {
    expect(sameSite(null, "https://a.com")).toBe(false);
    expect(sameSite("nope", "https://a.com")).toBe(false);
  });
});
