import { describe, it, expect } from "vitest";
import { arrangeDay, durationFor, walkMinutes, walkingOrder, type ArrangeItem } from "./arrange";

// Rome, around the Pantheon.
const PANTHEON = { lat: 41.8986, lng: 12.4769 };
const NAVONA   = { lat: 41.8992, lng: 12.4731 };   // ~330 m west
const TREVI    = { lat: 41.9009, lng: 12.4833 };   // ~590 m east
const COLOSSEUM = { lat: 41.8902, lng: 12.4922 };  // ~1.6 km south-east

const item = (id: string, type: ArrangeItem["type"], subType: string | null, at: { lat: number; lng: number } | null): ArrangeItem =>
  ({ id, type, subType, lat: at?.lat ?? null, lng: at?.lng ?? null });

describe("durations", () => {
  it("knows a coffee from a tour", () => {
    expect(durationFor("food", "coffee")).toBe(45);
    expect(durationFor("food", "restaurant")).toBe(75);
    expect(durationFor("activity", "tour")).toBe(120);
    expect(durationFor("activity", "explore")).toBe(90);
    expect(durationFor("food", "unknown")).toBe(60);
  });
});

describe("walking", () => {
  it("is 80 m a minute, floored at 5 and capped at 30", () => {
    expect(walkMinutes(PANTHEON, NAVONA)).toBe(5);
    expect(walkMinutes(PANTHEON, TREVI)).toBe(7);
    expect(walkMinutes(PANTHEON, COLOSSEUM)).toBe(20);
    expect(walkMinutes(PANTHEON, { lat: 41.95, lng: 12.5 })).toBe(30);
  });
  it("orders by nearest neighbour from the anchor, unlocated last", () => {
    const order = walkingOrder(
      [item("col", "activity", "explore", COLOSSEUM), item("note", "activity", null, null), item("trevi", "activity", "explore", TREVI), item("nav", "activity", "explore", NAVONA)],
      PANTHEON,
    ).map((i) => i.id);
    expect(order).toEqual(["nav", "trevi", "col", "note"]);
  });
});

describe("arrangeDay", () => {
  it("puts coffee at nine, lunch at half twelve, the sight in between", () => {
    const { placed, unplaced } = arrangeDay(
      [item("lunch", "food", "restaurant", NAVONA), item("coffee", "food", "coffee", PANTHEON), item("trevi", "activity", "explore", TREVI)],
      [], PANTHEON,
    );
    expect(unplaced).toEqual([]);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.coffee.startMin).toBe(9 * 60);
    expect(by.lunch.startMin).toBe(12 * 60 + 30);
    expect(by.trevi.startMin).toBeGreaterThanOrEqual(9 * 60 + 45);
    expect(by.trevi.endMin).toBeLessThanOrEqual(12 * 60 + 30);
  });

  it("gives two restaurants lunch and dinner", () => {
    const { placed } = arrangeDay([item("a", "food", "restaurant", NAVONA), item("b", "food", "restaurant", TREVI)], [], PANTHEON);
    expect(placed.map((p) => p.startMin)).toEqual([12 * 60 + 30, 19 * 60 + 30]);
  });

  it("keeps clear of what is already on the day", () => {
    const { placed } = arrangeDay(
      [item("coffee", "food", "coffee", PANTHEON)],
      [{ startMin: 9 * 60, endMin: 10 * 60 }], PANTHEON,
    );
    expect(placed[0].startMin).toBe(10 * 60);
  });

  it("walks the sights in order with time between them", () => {
    const { placed } = arrangeDay(
      [item("col", "activity", "explore", COLOSSEUM), item("nav", "activity", "explore", NAVONA), item("trevi", "activity", "explore", TREVI)],
      [], PANTHEON,
    );
    expect(placed.map((p) => p.id)).toEqual(["nav", "trevi", "col"]);
    for (let i = 1; i < placed.length; i++) expect(placed[i].startMin).toBeGreaterThanOrEqual(placed[i - 1].endMin + 5);
    expect(placed.every((p) => p.startMin % 15 === 0)).toBe(true);
  });

  it("reports what would not fit", () => {
    const busy = [{ startMin: 9 * 60, endMin: 23 * 60 + 45 }];
    const { placed, unplaced } = arrangeDay([item("x", "activity", "tour", TREVI)], busy, null);
    expect(placed).toEqual([]);
    expect(unplaced).toEqual(["x"]);
  });
});
