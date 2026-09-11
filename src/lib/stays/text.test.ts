import { describe, it, expect } from "vitest";
import { compassWord, areaHeadline, areaLine, baseArea, splitText, reachNote, reviewNotes, fitFloorText, hostQuestions } from "./text";
import type { StayBrief, Anchor } from "./brief";

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
  bases: [{ label: "Lucca", lat: 43.8431, lng: 10.5032, km: 0, pins: 8, nights: 11 }],
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

/**
 * Japan, as it read on 11 Sept 2026: five sentences, one of them wrong and one
 * of them a copy of the tabs above it. These pin what replaced them.
 */
const JAPAN: StayBrief = {
  ...TUSCANY,
  nights: 13, days: 14,
  evening: { lat: 35.6580, lng: 139.7016, label: "Tokyo", days: 0, evenings: false },
  bases: [
    { label: "Tokyo", lat: 35.6580, lng: 139.7016, km: 0, pins: 22, nights: 8 },
    { label: "Osaka", lat: 34.6937, lng: 135.5023, km: 400, pins: 7, nights: 5 },
  ],
};

describe("more than one base", () => {
  it("leaves the count and the night split to the switcher above it", () => {
    // It used to say "— 2 places to stay. Roughly Tokyo 8 nights, Osaka 5",
    // which is exactly what the two tabs say (Brennan, 11 Sept 2026).
    expect(splitText(JAPAN, {})).toBe("Too spread out for one base.");
    expect(splitText(JAPAN, {})).not.toMatch(/Tokyo|Osaka|[0-9]/);
  });

  it("gives each base its OWN line, not the whole journey's", () => {
    // Both tabs used to carry "West of Tokyo, toward Osaka. Most of your
    // places are around Tokyo" — wrong on the Osaka tab, and beside the point
    // on Tokyo's now that Osaka has its own hotel.
    expect(baseArea(JAPAN, 0)).toBe("Stay within 15 minutes of Tokyo.");
    expect(baseArea(JAPAN, 1)).toBe("Stay within 15 minutes of Osaka.");
    expect(baseArea(JAPAN, 2)).toBeNull();
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

describe("what the nights cannot reach", () => {
  const far = (label: string, lat: number, lng: number, days: number): Anchor => ({ kind: "daytrip", label, lat, lng, days, kmFromEvening: 400 });
  const JP: StayBrief = {
    ...TUSCANY,
    nights: 13, days: 14,
    anchors: [
      { kind: "evening", label: "Tokyo", lat: 35.658, lng: 139.7016, days: 2, kmFromEvening: 0 },
      { kind: "airport", label: "Narita", lat: 35.7719, lng: 140.3929, days: 1, kmFromEvening: 60 },
      far("Kagoshima", 31.5966, 130.5571, 2),
      far("Hiroshima", 34.3853, 132.4553, 1),
      far("Kanazawa", 36.5613, 136.6562, 1),
    ],
    bases: [
      { label: "Tokyo", lat: 35.658, lng: 139.7016, km: 0, pins: 22, nights: 8 },
      { label: "Osaka", lat: 34.6937, lng: 135.5023, km: 400, pins: 7, nights: 5 },
    ],
  };

  it("names the places that sit outside every base", () => {
    expect(reachNote(JP))
      .toBe("Kagoshima, Hiroshima and Kanazawa sit well outside every base; 13 nights probably will not reach them.");
  });

  it("counts the rest once there are more than three", () => {
    const more = { ...JP, anchors: [...JP.anchors, far("Sapporo", 43.0621, 141.3544, 1)] };
    expect(reachNote(more))
      .toBe("Kagoshima, Hiroshima and 2 more sit well outside every base; 13 nights probably will not reach them.");
  });

  it("names the one base when there is only one", () => {
    const one = { ...JP, bases: [JP.bases[0]], anchors: JP.anchors.slice(0, 3) };
    expect(reachNote(one))
      .toBe("Kagoshima sits well outside Tokyo; 13 nights probably will not reach it.");
  });

  it("says nothing when everything is within reach", () => {
    expect(reachNote(TUSCANY)).toBeNull();
  });

  it("never counts the airport as a place he wanted to go", () => {
    const airportOnly = { ...JP, anchors: JP.anchors.slice(0, 2) };
    expect(reachNote(airportOnly)).toBeNull();
  });
});

/**
 * New York, exactly as it stood on 11 Sept 2026: three nights, every pin in
 * Manhattan, and LaGuardia the only anchor more than 5 km from the centre.
 * The sheet opened "North-east of New York, toward East Elmhurst" — telling
 * him to sit near the airport for a three-night trip to Manhattan.
 */
const NYC: StayBrief = {
  ...TUSCANY,
  nights: 3, days: 4, kind: "hotel", radiusMin: 15,
  party: { total: 2, adults: 2, kids: 0, seniors: 0, under5: false },
  evening: { lat: 40.7214, lng: -73.9896, label: "New York", days: 3, evenings: true },
  anchors: [
    { kind: "evening", label: "New York", lat: 40.7214, lng: -73.9896, days: 3, kmFromEvening: 0 },
    { kind: "airport", label: "East Elmhurst", lat: 40.7769, lng: -73.8740, days: 1, kmFromEvening: 11 },
    { kind: "daytrip", label: "New York", lat: 40.7300, lng: -73.9950, days: 1, kmFromEvening: 1 },
  ],
  splitCandidates: [],
  bases: [{ label: "New York", lat: 40.7214, lng: -73.9896, km: 0, pins: 26, nights: 3 }],
};

describe("a city where the only thing out of town is the airport", () => {
  it("does not send him toward the airport", () => {
    const head = areaHeadline(NYC) ?? "";
    expect(head).not.toMatch(/East Elmhurst/);
    expect(head).toBe("In New York.");
  });

  it("still gives a direction when there is somewhere to go", () => {
    // Tuscany's pull is real: day trips 34 to 74 km out, in one direction.
    expect(areaHeadline(TUSCANY)).toBe("South of Lucca, toward Pisa.");
  });

  it("leaves the useful sentence intact", () => {
    expect(areaLine(NYC, 28)).toBe("3 evenings in New York; stay within 15 minutes of it. Airport 28 min.");
  });
});

/**
 * The direction, across all nine of his journeys (printed 11 Sept 2026).
 * Where it reads well the journey genuinely leaves town; where it read badly
 * everything was local and the sentence reached for the airport to find a
 * direction at all.
 */
describe("a direction is given only when the journey leaves town", () => {
  const brief = (farKm: number, kind: "airport" | "daytrip" = "daytrip"): StayBrief => ({
    ...TUSCANY,
    evening: { lat: 43.8431, lng: 10.5032, label: "Lucca", days: 2, evenings: true },
    anchors: [
      { kind: "evening", label: "Lucca", lat: 43.8431, lng: 10.5032, days: 2, kmFromEvening: 0 },
      { kind, label: "Somewhere", lat: 43.8431 + farKm / 111, lng: 10.5032, days: 2, kmFromEvening: farKm },
    ],
  });

  it("says nothing directional when everything is within about 25 km", () => {
    // New York 12 km, Santa Barbara 18, Rome 21 — all of them used to point
    // at their own airport.
    for (const km of [6, 12, 18, 21, 24]) {
      expect(areaHeadline(brief(km)), `${km} km`).toBe("In Lucca.");
    }
  });

  it("gives one once something is genuinely out of town", () => {
    // Sydney 32 km, Palm Springs 49, Costa Rica 56, Tuscany 74.
    for (const km of [32, 49, 56, 74]) {
      expect(areaHeadline(brief(km)), `${km} km`).toBe("North of Lucca, toward Somewhere.");
    }
  });

  it("keeps the four that read well, unchanged", () => {
    expect(areaHeadline(TUSCANY)).toBe("South of Lucca, toward Pisa.");
  });
});
