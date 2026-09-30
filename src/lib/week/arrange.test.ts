import { describe, it, expect } from "vitest";
import { arrangeDay, durationFor, travelMinutes, walkingOrder, type ArrangeItem } from "./arrange";

// Rome, around the Pantheon.
const PANTHEON = { lat: 41.8986, lng: 12.4769 };
const NAVONA   = { lat: 41.8992, lng: 12.4731 };   // ~330 m west
const TREVI    = { lat: 41.9009, lng: 12.4833 };   // ~590 m east
const COLOSSEUM = { lat: 41.8902, lng: 12.4922 };  // ~1.6 km south-east
const CIVITAVECCHIA = { lat: 42.0935, lng: 11.7925 }; // the cruise port, 62 km out
const BCN_AIRPORT = { lat: 41.2974, lng: 2.0833 };
const BCN_TERMINAL = { lat: 41.3524, lng: 2.1663 };
const SAGRADA = { lat: 41.4036, lng: 2.1744 };

const item = (id: string, type: ArrangeItem["type"], subType: string | null, at: { lat: number; lng: number } | null): ArrangeItem =>
  ({ id, type, subType, lat: at?.lat ?? null, lng: at?.lng ?? null });

describe("durations", () => {
  it("knows a coffee from a tour", () => {
    // His numbers, 30 Sep 2026: dinner two hours, coffee half an hour, a tour 90 minutes.
    expect(durationFor("food", "coffee")).toBe(30);
    expect(durationFor("food", "restaurant", 19 * 60)).toBe(120);
    expect(durationFor("food", "restaurant", 12 * 60 + 30)).toBe(75);
    expect(durationFor("food", "restaurant")).toBe(75);
    expect(durationFor("activity", "tour")).toBe(90);
    expect(durationFor("activity", "guided")).toBe(90);
    expect(durationFor("activity", "explore")).toBe(90);
    expect(durationFor("food", "unknown")).toBe(60);
  });
});

describe("walking", () => {
  it("walks up to 2 km at 80 m a minute, floored at 5", () => {
    expect(travelMinutes(PANTHEON, NAVONA)).toBe(5);
    expect(travelMinutes(PANTHEON, TREVI)).toBe(7);
    expect(travelMinutes(PANTHEON, COLOSSEUM)).toBe(20);
  });
  it("rides beyond 2 km instead of capping at 30 minutes", () => {
    expect(travelMinutes(PANTHEON, { lat: 41.95, lng: 12.5 })).toBe(25);   // 6 km across town
    expect(travelMinutes(COLOSSEUM, CIVITAVECCHIA)).toBe(105);             // 62 km to the ship
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

// 27 Sep 2026: a Mediterranean cruise, built through the app.
describe("a port or a flight hinges the day", () => {
  it("a port day starts at the ship, with the ride to Rome before the Colosseum", () => {
    const { placed } = arrangeDay(
      [item("col", "activity", "self_directed", COLOSSEUM), item("port", "logistics", "transit", CIVITAVECCHIA)],
      [], COLOSSEUM,
    );
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(placed.map((p) => p.id)).toEqual(["port", "col"]);
    expect(by.port.startMin).toBe(9 * 60 + 45);
    expect(by.col.startMin).toBeGreaterThanOrEqual(by.port.endMin + 105);
  });
  it("embarkation day: land, see something, board last", () => {
    const { placed } = arrangeDay(
      [item("ship", "logistics", "transit", BCN_TERMINAL), item("sagrada", "activity", "self_directed", SAGRADA), item("fly", "logistics", "flight_arrival", BCN_AIRPORT)],
      [], BCN_TERMINAL, { first: true, last: false },
    );
    expect(placed.map((p) => p.id)).toEqual(["fly", "sagrada", "ship"]);
  });
  it("last day: off the ship first, the flight home last", () => {
    const { placed } = arrangeDay(
      [item("fly", "logistics", "flight_arrival", BCN_AIRPORT), item("sagrada", "activity", "self_directed", SAGRADA), item("ship", "logistics", "transit", BCN_TERMINAL)],
      [], BCN_AIRPORT, { first: false, last: true },
    );
    expect(placed.map((p) => p.id)).toEqual(["ship", "sagrada", "fly"]);
  });
});

describe("a day camp", () => {
  it("is dropped off at nine and lasts till three; the day fits around it", () => {
    const { placed } = arrangeDay([item("gelato", "food", "dessert", NAVONA), item("camp", "activity", "camp", TREVI), item("col", "activity", "explore", COLOSSEUM)], [], PANTHEON);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.camp).toEqual({ id: "camp", startMin: 9 * 60, endMin: 15 * 60 });
    expect(by.col.startMin >= 15 * 60 || by.col.endMin <= 9 * 60).toBe(true);
  });
});

describe("a day that starts nowhere near its places", () => {
  it("a London day on a Europe summer starts in London, not 17 hours from Germany", () => {
    const TUBINGEN = { lat: 48.5, lng: 9.0 };
    const BM = { lat: 51.5194, lng: -0.127 }, NHM = { lat: 51.4967, lng: -0.1764 };
    const { placed, unplaced } = arrangeDay([item("bm", "activity", "guided", BM), item("nhm", "activity", "guided", NHM)], [], TUBINGEN);
    expect(unplaced).toEqual([]);
    expect(placed[0].startMin).toBe(9 * 60 + 45);
  });
});

describe("a stay is a check-in", () => {
  it("goes in mid-afternoon for half an hour, not first thing as a sight", () => {
    const { placed } = arrangeDay([item("lodge", "logistics", "hotel", TREVI), item("nav", "activity", "explore", NAVONA)], [], PANTHEON);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.lodge).toEqual({ id: "lodge", startMin: 15 * 60, endMin: 15 * 60 + 30 });
    expect(by.nav.startMin).toBeLessThan(15 * 60);
  });
});

import { readFileSync } from "fs";
describe("a pin dragged from the map onto the week", () => {
  it("takes its kind's length at the drop time, not an hour (WeekBoard putFromMap)", () => {
    const board = readFileSync("src/components/plan/WeekBoard.tsx", "utf8");
    const put = board.slice(board.indexOf("const putFromMap"), board.indexOf("const putFromMap") + 900);
    expect(put).toMatch(/min \+ durationFor\(card\.place\?\.type \?\? "activity", card\.place\?\.sub_type \?\? null, min\)/);
    expect(put).not.toMatch(/min \+ 60/);
  });
});
