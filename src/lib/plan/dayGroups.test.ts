import { describe, it, expect } from "vitest";
import fixture from "./fixtures/trips.json";
import { groupPins, dayShare, loadOf, type Pin, type Grouping } from "./dayGroups";

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

  it("Japan: Tokyo is five days, and the whole trip more than its fourteen", () => {
    const g = run("Japan");
    const tokyo = g.groups[groupOf(g, "Ghibli Museum")].region;
    expect(g.regions.find((r) => r.id === tokyo)!.days).toBe(5);
    expect(g.groups.length).toBeGreaterThan(14);
  });

  it("Japan: bars are left for you when children travel", () => {
    const g = run("Japan");
    expect(g.left.filter((l) => l.reason.startsWith("A bar"))).toHaveLength(6);
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
    for (const errand of ["Carrefour Express Via Vittoria Store", "ZARA Rome", "Antica Farmacia Santa Lucia"]) expect(groupOf(rome, errand)).toBe(-1);
  });

  it("every group is one day or less, and every place is accounted for once", () => {
    for (const t of trips) {
      const g = groupPins(t.pins, { kids: t.kids });
      for (const x of g.groups) {
        expect(x.load).toBeLessThanOrEqual(1);
        expect(x.items.length).toBeLessThanOrEqual(t.kids ? 3 : 4);
        expect(x.openDays).toMatch(/1/);
      }
      const placed = [...g.groups.flatMap((x) => [...x.items, ...x.meals]), ...g.spareMeals, ...g.left.map((l) => l.pin)].map((p) => p.id);
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
    expect(dayShare(at("Ginza Itoya", 0, 0))).toBe(0.25);
    expect(dayShare(at("Kiyomizu-dera", 0, 0))).toBe(0.5);
  });
  it("a second sight a short walk away costs half", () => {
    expect(loadOf([at("A", 41.9, 12.48), at("B", 41.901, 12.481)])).toBe(0.75);
    expect(loadOf([at("A", 41.9, 12.48), at("B", 41.95, 12.48)])).toBe(1);
  });
});
