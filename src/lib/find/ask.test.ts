import { describe, it, expect } from "vitest";
import { googleQuery, travellersPrompt, parseTravellers } from "./ask";

describe("googleQuery", () => {
  it("names the category in plain words, or uses what the person asked", () => {
    expect(googleQuery("coffee", "Kyoto", null)).toBe("coffee shop in Kyoto");
    expect(googleQuery("restaurant", "Kyoto", "ramen open late")).toBe("ramen open late in Kyoto");
  });
});

describe("travellersPrompt", () => {
  it("says who is going and asks for travellers' picks with a source", () => {
    const p = travellersPrompt({ base: "Kyoto", country: "Japan", subType: "self_directed", ask: null, party: 5, childAges: [10, 8, 5], month: "April 2028" });
    expect(p).toMatch(/a family of 5 with children aged 10, 8, 5/);
    expect(p).toMatch(/Reddit/);
    expect(p).toMatch(/"source_url"/);
    expect(travellersPrompt({ base: "Rome", country: null, subType: "bar", ask: null, party: 2, childAges: [], month: "April 2026" })).toMatch(/for 2 adults/);
  });
});

describe("parseTravellers", () => {
  it("reads the JSON, fenced or bare, and drops what is unusable", () => {
    const text = 'Here you go:\n```json\n{"places":[{"name":"Kyoto Railway Museum","near":"Umekoji","why":"Real trains to climb into.","source_name":"r/JapanTravel","source_url":"https://reddit.com/r/x","kids":true},{"name":""},{"name":"Nishiki Market","why":"Snacks","source_url":"not a url"}]}\n```';
    const out = parseTravellers(text);
    expect(out.map((p) => p.name)).toEqual(["Kyoto Railway Museum", "Nishiki Market"]);
    expect(out[0]).toMatchObject({ kids: true, sourceUrl: "https://reddit.com/r/x" });
    expect(out[1].sourceUrl).toBeNull();
    expect(parseTravellers("no json here")).toEqual([]);
  });
});
