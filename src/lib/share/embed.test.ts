import { describe, it, expect } from "vitest";
import { embedFor, providerOf } from "./embed";

describe("embedFor", () => {
  it("plays a full TikTok link", () => {
    expect(embedFor("https://www.tiktok.com/@florencefinds/video/7412345678901234567")).toEqual({
      provider: "tiktok",
      embedUrl: "https://www.tiktok.com/embed/v2/7412345678901234567",
    });
  });
  it("cannot play a TikTok short link until it is followed", () => {
    expect(embedFor("https://vt.tiktok.com/ZSqJ1G8RJ/")).toBeNull();
  });
  it("plays Instagram reels and posts, dropping the share query", () => {
    expect(embedFor("https://www.instagram.com/reel/C9xYz_12ab/?igsh=abc")?.embedUrl)
      .toBe("https://www.instagram.com/reel/C9xYz_12ab/embed/");
    expect(embedFor("https://www.instagram.com/reels/C9xYz_12ab/")?.embedUrl)
      .toBe("https://www.instagram.com/reel/C9xYz_12ab/embed/");
    expect(embedFor("https://instagram.com/p/Babc123/")?.embedUrl)
      .toBe("https://www.instagram.com/p/Babc123/embed/");
  });
  it("ignores anything else", () => {
    expect(embedFor("https://www.instagram.com/florencefinds/")).toBeNull();
    expect(embedFor("https://evil.example/video/123")).toBeNull();
    expect(embedFor("not a link")).toBeNull();
    expect(embedFor(null)).toBeNull();
  });
});

describe("providerOf", () => {
  it("names the app", () => {
    expect(providerOf("https://vt.tiktok.com/x/")).toBe("tiktok");
    expect(providerOf("https://www.instagram.com/reel/x/")).toBe("instagram");
    expect(providerOf("https://www.salogivillas.com/")).toBeNull();
  });
});
