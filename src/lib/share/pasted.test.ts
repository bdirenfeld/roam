import { describe, it, expect } from "vitest";
import { pastedSocialLink, shareHref, wantsPasteRow } from "./pasted";

describe("pastedSocialLink", () => {
  it("finds a TikTok short link inside the text TikTok copies", () => {
    expect(pastedSocialLink("the best francesinha in Porto 🥪 https://vt.tiktok.com/ZSabc123/ #porto")).toEqual({ url: "https://vt.tiktok.com/ZSabc123/", provider: "tiktok" });
  });
  it("finds an Instagram reel link and drops trailing punctuation", () => {
    expect(pastedSocialLink("look: https://www.instagram.com/reel/C9xYz_1/?igsh=abc).")).toEqual({ url: "https://www.instagram.com/reel/C9xYz_1/?igsh=abc", provider: "instagram" });
  });
  it("ignores other links, plain text and nothing", () => {
    expect(pastedSocialLink("https://maps.google.com/?q=porto")).toBeNull();
    expect(pastedSocialLink("Café Santiago")).toBeNull();
    expect(pastedSocialLink("")).toBeNull();
    expect(pastedSocialLink(null)).toBeNull();
  });
  it("takes the first social link when there are several links", () => {
    expect(pastedSocialLink("https://example.com https://www.tiktok.com/@a/video/123")?.provider).toBe("tiktok");
  });
});

describe("shareHref", () => {
  it("sends the link to the share page, encoded", () => {
    expect(shareHref("https://vt.tiktok.com/ZS1/?a=b&c=d")).toBe("/share?url=https%3A%2F%2Fvt.tiktok.com%2FZS1%2F%3Fa%3Db%26c%3Dd");
  });
});

describe("wantsPasteRow", () => {
  it("iPhone and iPad yes; Android and computers no (Android has the share sheet)", () => {
    expect(wantsPasteRow("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(wantsPasteRow("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(wantsPasteRow("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")).toBe(false);
    expect(wantsPasteRow("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
