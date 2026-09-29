import { describe, it, expect } from "vitest";
import fixture from "@/lib/plan/fixtures/trips.json";
import type { Card } from "@/types/database";
import { findBases, gapsFor, FIND_CATEGORIES } from "./gaps";

type Row = { t: string; ty: string; st: string | null; la: number | null; ln: number | null; types?: string[]; day?: number | null };
const cardsOf = (title: string, address: (t: string) => string) =>
  (fixture.trips.find((t) => t.title === title)!.pins as Row[]).map((p, i) => ({
    id: `c${i}`, place_id: `p${i}`, status: p.day ? "in_itinerary" : "interested", day_id: p.day ? `d${p.day}` : null, details: {},
    place: { id: `p${i}`, title: p.t, type: p.ty, sub_type: p.st, lat: p.la, lng: p.ln, address: address(p.t) },
  })) as unknown as Card[];

const JAPAN = { destination: "Japan", destination_lat: 36.2, destination_lng: 138.25, start_date: "2028-04-02", end_date: "2028-04-15" };

describe("findBases", () => {
  it("a journey with nothing on its map has one base: its destination, all its days", () => {
    const b = findBases([], { destination: "Rome, Italy", destination_lat: 41.9, destination_lng: 12.5, start_date: "2026-04-22", end_date: "2026-04-28" });
    expect(b).toEqual([{ label: "Rome", lat: 41.9, lng: 12.5, days: 7, counts: {} }]);
  });

  it("Japan's saved places make several bases, Tokyo the biggest, days adding to the trip", () => {
    const b = findBases(cardsOf("Japan", () => ""), JAPAN);
    expect(b.length).toBeGreaterThan(3);
    const days = b.reduce((s, x) => s + x.days, 0);
    expect(days).toBeGreaterThanOrEqual(12);
    expect(days).toBeLessThanOrEqual(16);
    // Tokyo holds most of the places, so the first base sits in Tokyo.
    expect(Math.abs(b[0].lat - 35.65)).toBeLessThan(0.5);
    expect(Math.abs(b[0].lng - 139.65)).toBeLessThan(0.6);
  });

  it("Rome is one base with its counts by Roam's sub-types", () => {
    const b = findBases(cardsOf("Rome", () => "Via Roma, 00186 Roma RM, Italy"), { destination: "Rome, Italy", destination_lat: 41.9, destination_lng: 12.5, start_date: "2026-04-22", end_date: "2026-04-28" });
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe("Roma");
    expect(b[0].counts.restaurant).toBeGreaterThan(5);
    expect(b[0].counts.coffee).toBeGreaterThan(3);
  });
});

describe("gapsFor", () => {
  it("uses only Roam's categories, with a target for coffee, restaurants and sights", () => {
    const gaps = gapsFor({ label: "Kyoto", lat: 35, lng: 135.7, days: 4, counts: { restaurant: 1, self_directed: 3 } });
    expect(gaps.map((g) => g.category.subType)).toEqual(FIND_CATEGORIES.map((c) => c.subType));
    const by = (s: string) => gaps.find((g) => g.category.subType === s)!;
    expect(by("coffee")).toMatchObject({ have: 0, want: 4, short: true });
    expect(by("restaurant")).toMatchObject({ have: 1, want: 8, short: true });
    expect(by("self_directed")).toMatchObject({ have: 3, want: 8, short: true });
    expect(by("dessert")).toMatchObject({ have: 0, want: null, short: true });
  });
});
