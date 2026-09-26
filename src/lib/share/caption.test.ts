import { describe, it, expect } from "vitest";
import { isTikTok, trimCaption, parseGuess } from "./caption";

describe("isTikTok", () => {
  it("knows the short and full links", () => {
    expect(isTikTok("https://vt.tiktok.com/ZSqJ1G8RJ/")).toBe(true);
    expect(isTikTok("https://www.tiktok.com/@x/video/123")).toBe(true);
  });
  it("is not fooled by lookalikes or Instagram", () => {
    expect(isTikTok("https://www.instagram.com/reel/abc/")).toBe(false);
    expect(isTikTok("https://tiktok.com.evil.example/x")).toBe(false);
    expect(isTikTok(null)).toBe(false);
    expect(isTikTok("not a url")).toBe(false);
  });
});

describe("trimCaption", () => {
  it("keeps the words and the first eight hashtags", () => {
    // Real caption, 26 Sep 2026.
    const c = "Florence hole in the wall 🍹🇮🇹 Babae Firenze📍#babaefirenze #babae #florencewinewindows #florencefinds #holeinthewall #aperol #aperolspritz #wheninflorence #a #b";
    const t = trimCaption(c);
    expect(t).toContain("Babae Firenze");
    expect(t).toContain("#wheninflorence");
    expect(t).not.toContain("#a ");
  });
  it("caps a long caption", () => {
    expect(trimCaption("word ".repeat(400)).length).toBeLessThanOrEqual(600);
  });
});

describe("parseGuess", () => {
  it("joins the name and where it is", () => {
    expect(parseGuess('{"name":"Babae","near":"Florence"}')).toEqual({ query: "Babae, Florence" });
  });
  it("reads JSON wrapped in prose or a fence", () => {
    expect(parseGuess('Here:\n```json\n{"name":"Hotel Il Pelicano","near":"Porto Ercole"}\n```')?.query)
      .toBe("Hotel Il Pelicano, Porto Ercole");
  });
  it("does not repeat a town that is the place", () => {
    expect(parseGuess('{"name":"Castiglioncello","near":"Castiglioncello"}')).toEqual({ query: "Castiglioncello" });
  });
  it("treats no name, a country, or junk as no guess", () => {
    expect(parseGuess('{"name":null,"near":null}')).toBeNull();
    expect(parseGuess('{"name":"Italy","near":null}')).toBeNull();
    expect(parseGuess("I couldn't find a place.")).toBeNull();
    expect(parseGuess("{broken")).toBeNull();
  });
});
