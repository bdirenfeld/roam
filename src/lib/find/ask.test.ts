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

describe("events a day trip away, the special ones first", () => {
  it("Tuscany: within two hours of Lucca, leading with palios and historic races (the Bravio delle Botti)", () => {
    const p = travellersPrompt({ base: "Lucca", country: "Italy", subType: "event", ask: null, party: 5, childAges: [10, 8, 5], month: "August 2027", from: "2027-08-24", to: "2027-09-04" });
    expect(p).toMatch(/within about two hours' drive of Lucca, Italy between 2027-08-24 and 2027-09-04/);
    expect(p).toMatch(/palios and historic races/);
    // A trip a year out: next year's programme is not published, so yearly events on those dates count.
    expect(p).toMatch(/held every year on those dates/);
    // Races and camps stay in town.
    expect(travellersPrompt({ base: "Lucca", country: "Italy", subType: "camp", ask: null, party: 5, childAges: [10], month: "August 2027", from: "2027-08-24", to: "2027-09-04" })).toMatch(/happening in Lucca, Italy between/);
  });
});

import { onTripDates } from "./ask";
describe("an event must fall on the journey's dates", () => {
  it("Tuscany, 24 Aug – 4 Sep 2027: the Bravio stays, the Luminara (13 Sep) goes", () => {
    expect(onTripDates("Usually Sun 29 Aug: Bravio delle Botti – barrel-rolling race", "2027-08-24", "2027-09-04")).toBe(true);
    expect(onTripDates("Sun 13 Sep (eve starts 13th): Luminara di Santa Croce", "2027-08-24", "2027-09-04")).toBe(false);
    expect(onTripDates("Usually early Sep: End of Summer Party on the Walls", "2027-08-24", "2027-09-04")).toBe(true);
    // A trip across New Year.
    expect(onTripDates("Sat 1 Jan: New Year's Day parade", "2027-12-28", "2028-01-03")).toBe(true);
  });
});
