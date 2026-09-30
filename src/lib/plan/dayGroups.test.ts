import { describe, it, expect } from "vitest";
import fixture from "./fixtures/trips.json";
import { groupPins, dayShare, loadOf, km, type Pin, type Grouping } from "./dayGroups";

// Brennan's own journeys as they sit in the database (fixtures/trips.json).
type Row = { t: string; ty: Pin["type"]; st: string | null; la: number | null; ln: number | null; open?: string | null; types?: string[]; day?: number | null };
const trips = (fixture.trips as { title: string; kids: boolean; pins: Row[] }[]).map((t) => ({
  ...t,
  pins: t.pins.map((p, i): Pin => ({ id: `${t.title}-${i}`, title: p.t, type: p.ty, subType: p.st, lat: p.la, lng: p.ln, open: p.open ?? null, types: p.types ?? null })),
}));
const run = (title: string) => {
  const t = trips.find((x) => x.title === title)!;
  return groupPins(t.pins, { kids: t.kids });
};
const groupOf = (g: Grouping, title: string) => g.groups.findIndex((x) => x.items.some((p) => p.title === title));

describe("groupPins on Brennan's journeys", () => {
  it("Japan: a day's places share a day", () => {
    const g = run("Japan");
    expect(groupOf(g, "Ghibli Museum")).toBe(groupOf(g, "PokéPark Kanto"));
    expect(groupOf(g, "Kamakura")).toBe(groupOf(g, "Shichirigahama"));
    expect(groupOf(g, "Kanazawa")).toBe(groupOf(g, "Kenroku-en"));
    // Super Nintendo World is inside Universal Studios: one day, not two.
    const usj = g.groups[groupOf(g, "Universal Studios Japan")];
    expect(usj.items.map((p) => p.title)).toContain("Super Nintendo World");
    expect(usj.load).toBe(1);
  });

  it("Japan: Tokyo is six days (Izu a day trip from it), and the whole trip more than its fourteen", () => {
    const g = run("Japan");
    const tokyo = g.groups[groupOf(g, "Ghibli Museum")].region;
    expect(g.regions.find((r) => r.id === tokyo)!.days).toBe(6);
    // 17 day-groups across 8 bases (100 km, as Where to stay), plus half a day for each of 7 moves.
    expect(g.groups.length).toBe(17);
    expect(g.daysNeeded).toBe(20.5);
  });

  it("Japan: bars join days like a meal, one a day", () => {
    const g = run("Japan");
    expect(g.left.filter((l) => /bar/i.test(l.reason))).toHaveLength(0);
    expect(g.groups.every((x) => x.meals.filter((m) => m.subType === "bar").length <= 1)).toBe(true);
    expect(g.groups.some((x) => x.meals.some((m) => m.subType === "bar"))).toBe(true);
  });

  it("Rome: a day whose places are all a short walk apart holds more", () => {
    const g = run("Rome");
    const walkable = g.groups.filter((x) => x.items.every((a) => x.items.every((b) => km(a as never, b as never) <= 2.5)));
    expect(walkable.some((x) => x.items.length >= 4)).toBe(true);
    expect(g.groups.every((x) => x.items.length <= 5)).toBe(true);
  });

  it("Sydney: Bondi with Bronte, the Opera House with the Rocks", () => {
    const g = run("Australia");
    expect(groupOf(g, "Bondi Beach")).toBe(groupOf(g, "Bronte Baths"));
    expect(groupOf(g, "Sydney Opera House")).toBe(groupOf(g, "The Rocks"));
  });

  it("an evening thing joins a day like dinner, and an errand never makes one", () => {
    const cr = run("Costa Rica");
    expect(groupOf(cr, "Tamarindo Night Market")).toBe(-1);
    expect(cr.groups.some((x) => x.meals.some((m) => m.title === "Tamarindo Night Market"))).toBe(true);
    const rome = run("Rome");
    // Google calls it a pharmacy: an errand, fitted round a day, never a day.
    expect(groupOf(rome, "Antica Farmacia Santa Lucia")).toBe(-1);
    expect(rome.groups.some((x) => x.meals.some((m) => m.title === "Antica Farmacia Santa Lucia"))).toBe(true);
  });

  it("every group is one day or less, and every place is accounted for once", () => {
    for (const t of trips) {
      const g = groupPins(t.pins, { kids: t.kids });
      for (const x of g.groups) {
        // With children no walkable bonus: three places, one day's load (Costa Rica test, 29 Sep 2026).
        expect(x.load).toBeLessThanOrEqual(t.kids ? 1 : 1.25);
        expect(x.items.length).toBeLessThanOrEqual(t.kids ? 3 : 5);
        expect(x.openDays).toMatch(/1/);
      }
      const placed = [...g.groups.flatMap((x) => [...x.items, ...x.meals]), ...g.spareMeals, ...g.left.map((l) => l.pin), ...g.tours.map((x) => x.pin)].map((p) => p.id);
      expect(new Set(placed).size).toBe(placed.length);
      const expected = t.pins.filter((p) => p.type !== "logistics" && !/taxi/i.test(p.title)).map((p) => p.id);
      expect(placed.sort()).toEqual(expected.sort());
    }
  });
});

describe("dayShare and loadOf", () => {
  const at = (title: string, lat: number, lng: number, extra: Partial<Pin> = {}): Pin => ({ id: title, title, type: "activity", subType: "self_directed", lat, lng, ...extra });
  it("a theme park is the day, a shop a quarter, a sight half", () => {
    expect(dayShare(at("Tokyo DisneySea", 0, 0, { types: ["amusement_park"] }))).toBe(1);
    expect(dayShare(at("A stationery shop", 0, 0))).toBe(0.25);
    expect(dayShare(at("Any name", 0, 0, { types: ["store"] }))).toBe(0.25);
    expect(dayShare(at("Legoland Windsor", 0, 0))).toBe(1);
    expect(dayShare(at("Farmacia Centrale", 0, 0))).toBe(0);
    expect(dayShare(at("Kiyomizu-dera", 0, 0))).toBe(0.5);
  });
  it("a second sight a short walk away costs half", () => {
    expect(loadOf([at("A", 41.9, 12.48), at("B", 41.901, 12.481)])).toBe(0.75);
    expect(loadOf([at("A", 41.9, 12.48), at("B", 41.95, 12.48)])).toBe(1);
  });
});

describe("tour companies", () => {
  it("never shape a day's route: they are set aside with their region", () => {
    const at = (id: string, lat: number, lng: number, types: string[]) => ({ id, title: id, type: "activity" as const, subType: "self_directed", lat, lng, types });
    const pins = [
      at("Forum", 41.8925, 12.4853, ["tourist_attraction"]),
      at("Colosseum", 41.8902, 12.4922, ["tourist_attraction"]),
      at("Crown Tours", 41.9010, 12.4990, ["travel_agency", "point_of_interest"]),
    ];
    const g = groupPins(pins, { kids: false });
    expect(g.groups.flatMap((x) => x.items).map((p) => p.id)).not.toContain("Crown Tours");
    expect(g.tours.map((t) => [t.pin.id, t.region])).toEqual([["Crown Tours", g.groups[0].region]]);
  });
});

describe("a walkable town with children", () => {
  it("holds three places a day, not four", () => {
    // Tamarindo, all within a kilometre: surf school, farmers' market, beach, wildlife rescue.
    const at = (id: string, lat: number, lng: number) => ({ id, title: id, type: "activity" as const, subType: "self_directed", lat, lng, types: ["tourist_attraction"] });
    const town = [at("Surf school", 10.2990, -85.8400), at("Market", 10.2995, -85.8390), at("Beach", 10.3000, -85.8410), at("Rescue", 10.2985, -85.8380)];
    expect(Math.max(...groupPins(town, { kids: true }).groups.map((g) => g.items.length))).toBeLessThanOrEqual(3);
    expect(Math.max(...groupPins(town, { kids: false }).groups.map((g) => g.items.length))).toBe(4);
  });
});

import { placeShare } from "./dayGroups";
describe("placeShare: a card's place, as Plan my trip sizes it", () => {
  it("DisneySea and a national park are the day; a museum half; food nothing", () => {
    expect(placeShare({ type: "activity", title: "Tokyo DisneySea", sub_type: "self_directed", details: { types: ["tourist_attraction"] } })).toBe(1);
    expect(placeShare({ type: "activity", title: "Palo Verde National Park", sub_type: "guided", details: { types: ["park"] } })).toBe(1);
    expect(placeShare({ type: "activity", title: "Anywhere", sub_type: null, types: ["zoo"] })).toBe(1);
    expect(placeShare({ type: "activity", title: "Ghibli Museum", sub_type: "guided", details: { types: ["museum"] } })).toBe(0.5);
    expect(placeShare({ type: "food", title: "Gion Unagi Kawato", sub_type: "restaurant" })).toBe(0);
    expect(placeShare(null)).toBe(0);
  });
});

import { isMuseum } from "./dayGroups";
describe("a museum is three hours", () => {
  it("by Google's type or the name, in his journeys' languages", () => {
    expect(isMuseum({ title: "Ghibli Museum", details: { types: ["museum"] } })).toBe(true);
    expect(isMuseum({ title: "Uffizi", types: ["art_gallery"] })).toBe(true);
    expect(isMuseum({ title: "Museo Nazionale Romano" })).toBe(true);
    expect(isMuseum({ title: "Galleria Borghese" })).toBe(true);
    expect(isMuseum({ title: "Kiyomizu-dera", details: { types: ["place_of_worship"] } })).toBe(false);
    expect(isMuseum(null)).toBe(false);
  });
});
