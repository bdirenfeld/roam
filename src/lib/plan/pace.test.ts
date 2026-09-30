import { describe, it, expect } from "vitest";
import { paceOf, paceDays, breaksFor, firstNightDinner } from "./pace";
import { placeGroups } from "./draftTrip";
import type { Grouping, DayGroup } from "./dayGroups";

// d1 = Wednesday 4 March 2026 (Costa Rica's first day).
const days = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, date: `2026-03-${String(4 + i).padStart(2, "0")}`, free: i === 0 || i === n - 1 ? 0.5 : 1 }));
const home = { lat: 10.3, lng: -85.84 }; // the Tamarindo casita
const g = (lat: number, lng: number, openDays = "1111111"): DayGroup => ({ region: 0, items: [], meals: [], load: 1, openDays, centre: { lat, lng } });
const grouping = (groups: DayGroup[]) => ({ regions: [{ id: 0, centre: home, days: groups.length, pins: groups.length }], groups, daysNeeded: groups.length, spareMeals: [] }) as unknown as Grouping;

describe("the pace of a trip", () => {
  it("weekend up to 4 days, a week to 7, long beyond", () => {
    expect([3, 4, 5, 7, 8, 14].map(paceOf)).toEqual(["weekend", "weekend", "week", "week", "long", "long"]);
  });
  it("a weekend has no pace rules", () => {
    const p = paceDays(days(4), true);
    expect(p.days).toEqual(days(4));
    expect(p.farFirst).toBe(true);
    expect(p.nearOnly.size).toBe(0);
    expect(p.maxRun).toBe(Infinity);
  });
  it("a week: an easy first day, days 1 and 2 near home", () => {
    const p = paceDays(days(6), true);
    expect(p.days[0].free).toBe(0.5);
    expect(Array.from(p.nearOnly)).toEqual(["d1", "d2"]);
  });
  it("long: settle in on day 1, day 2 near home, four busy days in a row with kids, five without", () => {
    const p = paceDays(days(9), true);
    expect(p.days[0].free).toBe(0);
    expect(Array.from(p.nearOnly)).toEqual(["d2"]);
    expect(p.maxRun).toBe(4);
    expect(paceDays(days(9), false).maxRun).toBe(5);
    // Costa Rica: days 2–5 busy, one off, then 7–9.
    expect(p.breaksNeeded).toBe(1);
    expect(breaksFor(paceDays(days(14), true).days, 4)).toBe(2);
  });
});

describe("placeGroups keeps to the pace", () => {
  const beach = g(10.33, -85.86), paloVerde = g(10.35, -85.32);

  it("a place open Thursdays and Sundays only is not put on day 2 (a Thursday) when it is far", () => {
    const pv = g(10.35, -85.32, "0001001");
    const p = paceDays(days(9).map((d) => ({ ...d, free: 1 })), true);
    const { placed } = placeGroups(grouping([pv, beach]), p.days, { start: home, nearOnly: p.nearOnly, maxRun: p.maxRun });
    expect(["d5", "d9"]).toContain(placed.find((x) => x.group === pv)?.dayId);
  });

  it("never more than four busy days in a row: a day off is kept even when a place then stays saved", () => {
    // Eight near places for eight free days: without the rule, eight busy days straight.
    const eight = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => g(10.3 + i * 0.01, -85.84));
    const p = paceDays(days(9).map((d) => ({ ...d, free: 1 })), true);
    const { placed, unplaced } = placeGroups(grouping(eight), p.days, { start: home, nearOnly: p.nearOnly, maxRun: p.maxRun });
    const on = new Set(placed.map((x) => x.dayId));
    expect(Array.from(on).sort()).toEqual(["d2", "d3", "d4", "d5", "d7", "d8", "d9"]);
    expect(unplaced.length).toBe(1);
  });

  it("a weekend puts the farthest place on the first day it fits", () => {
    const wk = paceDays(days(4).map((d) => ({ ...d, free: 1 })), true);
    const w = placeGroups(grouping([beach, paloVerde]), wk.days, { start: home, nearOnly: wk.nearOnly, farFirst: wk.farFirst });
    expect(w.placed[0]).toEqual({ dayId: "d1", group: paloVerde });
  });
});

describe("the first night's dinner", () => {
  const r = (id: string, lat: number, rating: number | null, o: Partial<{ subType: string; open: boolean }> = {}) => ({ id, lat, lng: -85.84, rating, subType: "restaurant", open: true, ...o });
  it("the best-rated restaurant near home, at 6:30, two hours", () => {
    const pick = firstNightDinner([r("ok", 10.301, 4.2), r("pangas", 10.305, 4.5), r("ocho", 10.31, 4.6), r("far", 10.5, 4.9)], home, null);
    expect(pick).toEqual({ id: "ocho", start: 18 * 60 + 30, end: 20 * 60 + 30 });
  });
  it("not after a late landing, not closed, not a coffee shop, not if nothing is really good", () => {
    expect(firstNightDinner([r("ocho", 10.31, 4.6)], home, 20 * 60 + 15)).toBeNull();
    expect(firstNightDinner([r("ocho", 10.31, 4.6)], home, 19 * 60 + 5)!.start).toBe(19 * 60 + 15);
    expect(firstNightDinner([r("ocho", 10.31, 4.6, { open: false })], home, null)).toBeNull();
    expect(firstNightDinner([r("cafe", 10.31, 4.9, { subType: "coffee" })], home, null)).toBeNull();
    expect(firstNightDinner([r("ok", 10.31, 4.2)], home, null)).toBeNull();
    expect(firstNightDinner([r("ocho", 10.31, 4.6)], null, null)).toBeNull();
  });
});
