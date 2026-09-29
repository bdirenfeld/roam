import { describe, it, expect } from "vitest";
import { googleQuery, travellersPrompt, parseTravellers, cacheKey } from "./ask";

describe("googleQuery", () => {
  it("names the category in plain words, or uses what the person asked", () => {
    expect(googleQuery("coffee", "Kyoto", null)).toBe("coffee shop in Kyoto");
    expect(googleQuery("restaurant", "Kyoto", "ramen open late")).toBe("ramen open late in Kyoto");
    // Google answers "beaches in Tamarindo" with one beach; "best beaches near" with twenty.
    expect(googleQuery("beach", "Tamarindo", null)).toBe("best beaches near Tamarindo");
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

describe("cacheKey", () => {
  it("one answer per base, category, question and kind of party", () => {
    const k = (o: Partial<Parameters<typeof cacheKey>[0]>) => cacheKey({ mode: "travellers", lat: 41.9028, lng: 12.4964, subType: "restaurant", ask: null, kids: false, ...o });
    expect(k({})).toBe("travellers|41.90|12.50|restaurant||adults||");
    expect(k({ near: [{ lat: 40.7795, lng: -73.9695 }] })).not.toBe(k({})); // coffee near the day is its own answer
    expect(k({ when: "2026-04-22|2026-04-28" })).not.toBe(k({}));
    expect(k({ lat: 41.9031 })).toBe(k({}));            // two journeys to Rome share
    expect(k({ ask: "  Ramen  open late " })).toBe(k({ ask: "ramen open late" }));
    expect(k({ kids: true })).not.toBe(k({}));
    expect(k({ mode: "google" })).not.toBe(k({}));
  });
});

describe("travellersPrompt, first visit", () => {
  it("asks for the must-sees before the hidden gems when exploring", () => {
    const base = { base: "Rome", country: "Italy", ask: null, party: 2, childAges: [], month: "April 2026" };
    expect(travellersPrompt({ ...base, subType: "self_directed" })).toMatch(/should not miss/);
    expect(travellersPrompt({ ...base, subType: "restaurant" })).not.toMatch(/should not miss/);
  });
});

describe("travellersPrompt, dated kinds and near the day", () => {
  const base = { base: "Rome", country: "Italy", ask: null, party: 2, childAges: [], month: "April 2026" };
  it("asks what is on during the journey's dates for events, races and camps", () => {
    const p = travellersPrompt({ ...base, subType: "event", from: "2026-04-22", to: "2026-04-28" });
    expect(p).toMatch(/between 2026-04-22 and 2026-04-28/);
    expect(p).toMatch(/never a venue with nothing on/);
    expect(travellersPrompt({ ...base, subType: "challenge", from: "2026-04-22", to: "2026-04-28" })).toMatch(/running races/);
  });
  it("keeps coffee to a short walk from the day's sights", () => {
    expect(travellersPrompt({ ...base, subType: "coffee", near: ["Colosseum", "Pantheon"] })).toMatch(/around Colosseum, Pantheon/);
    expect(travellersPrompt({ ...base, subType: "restaurant", near: ["Colosseum"] })).not.toMatch(/short walk/);
  });
});
