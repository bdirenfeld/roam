import { describe, it, expect } from "vitest";
import { compassWord, areaHeadline, areaLine, splitText, reviewNotes, fitFloorText, hostQuestions } from "./text";
import type { StayBrief } from "./brief";

/** The Tuscany brief as buildStayBrief returns it (see brief.test.ts), trimmed to what text needs. */
const TUSCANY: StayBrief = {
  nights: 11, days: 12,
  party: { total: 7, adults: 4, kids: 3, seniors: 2, under5: false },
  fit: { bedrooms: 4, baths: 3, askGroundFloor: true, askCot: false },
  kind: "house",
  evening: { lat: 43.8431, lng: 10.5032, label: "Lucca", days: 2, evenings: true },
  radiusMin: 15,
  stayDays: 2.5,
  anchors: [
    { kind: "evening", label: "Lucca", lat: 43.8431, lng: 10.5032, days: 2, kmFromEvening: 0 },
    { kind: "airport", label: "Pisa", lat: 43.6870, lng: 10.3943, days: 2, kmFromEvening: 19 },
    { kind: "daytrip", label: "Montefoscoli", lat: 43.5878, lng: 10.7372, days: 2, kmFromEvening: 34 },
    { kind: "daytrip", label: "Volterra", lat: 43.4021, lng: 10.8597, days: 1, kmFromEvening: 57 },
    { kind: "daytrip", label: "Colonnata", lat: 44.0843, lng: 10.1510, days: 1, kmFromEvening: 40 },
    { kind: "daytrip", label: "Firenze", lat: 43.7726, lng: 11.2566, days: 2, kmFromEvening: 61 },
    { kind: "daytrip", label: "La Spezia", lat: 44.1114, lng: 9.8134, days: 1, kmFromEvening: 62 },
    { kind: "daytrip", label: "Monterosso al Mare", lat: 44.1406, lng: 9.6664, days: 1, kmFromEvening: 74 },
  ],
  splitCandidates: [{ label: "Firenze", days: 2, km: 61 }],
  bases: [{ label: "Lucca", km: 0, pins: 8, nights: 11 }],
};

describe("compassWord", () => {
  it("Pisa is south-west of Lucca; Florence is east", () => {
    expect(compassWord(43.8431, 10.5032, 43.6870, 10.3943)).toBe("South-west");
    expect(compassWord(43.8431, 10.5032, 43.7726, 11.2566)).toBe("East");
  });
});

describe("areaHeadline", () => {
  it("Tuscany pulls south of Lucca, toward Pisa", () => {
    expect(areaHeadline(TUSCANY)).toBe("South of Lucca, toward Pisa.");
  });
  it("is 'In <town>' when nothing pulls away", () => {
    const city: StayBrief = { ...TUSCANY, anchors: [TUSCANY.anchors[0]], splitCandidates: [] };
    expect(areaHeadline(city)).toBe("In Lucca.");
  });
  it("is null with no evening centre", () => {
    expect(areaHeadline({ ...TUSCANY, evening: null })).toBeNull();
  });
});

describe("areaLine and splitText", () => {
  it("names the evenings, the radius and the airport", () => {
    expect(areaLine(TUSCANY, 30)).toBe("2 evenings in Lucca; stay within 15 minutes of it. Airport 30 min.");
    expect(areaLine(TUSCANY, null)).toBe("2 evenings in Lucca; stay within 15 minutes of it.");
  });
  it("Florence twice at 70 minutes saves 2 h 20; the sentence ends with his call", () => {
    expect(splitText(TUSCANY, { Firenze: 70 })).toBe("One base is enough. Two nights in Firenze would save 2 h 20 of driving; your call.");
  });
  it("says one base is enough when nothing qualifies, and nothing when the road is unknown", () => {
    expect(splitText({ ...TUSCANY, splitCandidates: [] }, {})).toBe("One base is enough.");
    expect(splitText(TUSCANY, {})).toBeNull();
    expect(splitText(TUSCANY, { Firenze: 45 })).toBeNull();
  });
});

describe("reviewNotes", () => {
  it("pulls the tells out of review text, once each", () => {
    const notes = reviewNotes([
      "Very quiet spot, the hosts were so helpful. The last 200 m are steep.",
      "Quiet and clean. Mosquitoes at dusk, bring spray. Pool was perfect for the kids.",
    ]);
    expect(notes).toBe("quiet, stairs or a steep approach, mosquitoes, the pool gets praise, helpful hosts, clean");
  });
  it("is null when nothing is said", () => {
    expect(reviewNotes(["Nice."])).toBeNull();
    expect(reviewNotes([])).toBeNull();
  });
});

describe("fit floor and host questions", () => {
  it("Tuscany needs 4 bedrooms and 3 baths, and asks about the ground floor, the pool and the shop", () => {
    expect(fitFloorText(TUSCANY)).toBe("Needs 4 bedrooms and 3 baths");
    expect(hostQuestions(TUSCANY)).toEqual([
      "Which floor are the bedrooms on?",
      "Is the pool fenced or gated?",
      "Is there a supermarket within ten minutes?",
    ]);
  });
  it("a couple in a hotel asks nothing", () => {
    const couple: StayBrief = { ...TUSCANY, kind: "hotel", party: { total: 2, adults: 2, kids: 0, seniors: 0, under5: false }, fit: { bedrooms: 1, baths: 1, askGroundFloor: false, askCot: false } };
    expect(fitFloorText(couple)).toBe("Needs 1 bedroom and 1 bath");
    expect(hostQuestions(couple)).toEqual([]);
  });
});
