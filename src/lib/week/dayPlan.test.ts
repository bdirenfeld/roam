import { describe, it, expect } from "vitest";
import { planExisting, planBatch, busyOf, anchorOf, flightBounds, plannedOtherDays } from "./dayPlan";
import type { Card } from "@/types/database";

const P = { pantheon: { lat: 41.8986, lng: 12.4769 }, navona: { lat: 41.8992, lng: 12.4731 }, trevi: { lat: 41.9009, lng: 12.4833 } };

function card(id: string, o: Partial<Card> & { title?: string; sub?: string; type?: "activity" | "food" | "logistics"; at?: { lat: number; lng: number } } = {}): Card {
  const { title = id, sub = "self_directed", type = "activity", at = P.pantheon, ...rest } = o;
  return {
    id, trip_id: "t", day_id: "d", list_id: null, place_id: `p-${id}`, status: "in_itinerary", position: 0,
    start_time: null, end_time: null, source_url: null, details: {}, ai_generated: false, confirmed: false, created_at: "",
    place: { id: `p-${id}`, title, type, sub_type: sub, lat: at.lat, lng: at.lng } as Card["place"],
    ...rest,
  } as Card;
}

describe("busy and anchor", () => {
  it("reads the timed blocks and starts from the first timed place", () => {
    const cards = [card("a", { start_time: "10:00:00", end_time: "11:00:00", at: P.trevi }), card("b", { at: P.navona })];
    expect(busyOf(cards)).toEqual([{ startMin: 600, endMin: 660 }]);
    expect(anchorOf(cards, null)).toEqual(P.trevi);
    expect(anchorOf([], { lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
  });
});

describe("planExisting", () => {
  it("rest: only the timeless get times, around the timed", () => {
    const cards = [card("lunch", { start_time: "12:30:00", end_time: "13:45:00", type: "food", sub: "restaurant" }), card("sight", { at: P.trevi })];
    const r = planExisting(cards, "rest", null);
    expect(r.updates.map((u) => u.id)).toEqual(["sight"]);
    expect(r.updates[0].start_time).toBe("09:45:00");
    expect(r.before).toEqual([{ id: "sight", start_time: null, end_time: null }]);
  });
  it("all: everything but confirmed moves, confirmed stays as an obstacle", () => {
    const cards = [card("booked", { start_time: "10:00:00", end_time: "12:00:00", confirmed: true }), card("a", { start_time: "10:30:00", end_time: "11:00:00", at: P.navona })];
    const r = planExisting(cards, "all", null);
    expect(r.updates.map((u) => u.id)).toEqual(["a"]);
    expect(r.updates[0].start_time).not.toBe("10:30:00");
    expect(r.before[0]).toEqual({ id: "a", start_time: "10:30:00", end_time: "11:00:00" });
  });
});

describe("planBatch", () => {
  it("skips places already on the day and repeats in the batch", () => {
    const day = [card("x", { start_time: "12:30:00", end_time: "13:45:00", place_id: "p-lunch" })];
    const picked = [card("lunch", { place_id: "p-lunch" }), card("t1", { at: P.trevi, place_id: "p-trevi" }), card("t2", { at: P.trevi, place_id: "p-trevi" })];
    const r = planBatch(picked, day, null);
    expect(r.toAdd.map((c) => c.id)).toEqual(["t1"]);
    expect(r.skipped).toBe(2);
    expect(r.times.get("t1")?.start).toBe("09:45:00");
  });
});

// 26 Sep 2026, the Japan test journey: day 12 had Kansai Airport at 3pm and
// the lasso scheduled Dotonbori at 4pm and a shrine at 10:15pm.
describe("flightBounds", () => {
  const flightHome = card("kix", { type: "logistics", sub: "flight_arrival", start_time: "15:00:00", end_time: "16:00:00" });
  it("closes the last day at the flight home", () => {
    expect(flightBounds([flightHome], { first: false, last: true })).toEqual([{ startMin: 900, endMin: 1440 }]);
  });
  it("opens the first day at landing", () => {
    expect(flightBounds([flightHome], { first: true, last: false })).toEqual([{ startMin: 0, endMin: 960 }]);
  });
  it("leaves middle days and flightless days alone", () => {
    expect(flightBounds([flightHome], { first: false, last: false })).toEqual([]);
    expect(flightBounds([card("a")], { first: false, last: true })).toEqual([]);
    expect(flightBounds([flightHome])).toEqual([]);
  });
  it("keeps a batch on the last day before the flight", () => {
    const r = planBatch([card("dotonbori"), card("shrine", { at: P.navona })], [flightHome], null, { edge: { first: false, last: true } });
    for (const t of Array.from(r.times.values())) expect(t.end <= "15:00").toBe(true);
  });
});

describe("planBatch across days", () => {
  it("skips places already planned on another day and counts them", () => {
    const usj = card("usj-saved", { place_id: "p-usj", day_id: null as unknown as string, status: "interested" });
    const aquarium = card("aq", { place_id: "p-aq", day_id: null as unknown as string, status: "interested" });
    const sunday = card("usj-sun", { place_id: "p-usj", day_id: "sun" });
    const r = planBatch([usj, aquarium], [], null, { plannedElsewhere: plannedOtherDays([sunday], "mon") });
    expect(r.toAdd.map((c) => c.id)).toEqual(["aq"]);
    expect(r.elsewhere).toBe(1);
    expect(r.skipped).toBe(0);
  });
  it("plannedOtherDays ignores the target day and saved pins", () => {
    const s = plannedOtherDays([card("a", { day_id: "mon", place_id: "p1" }), card("b", { day_id: "sun", place_id: "p2" }), card("c", { day_id: null as unknown as string, place_id: "p3" })], "mon");
    expect(Array.from(s)).toEqual(["p2"]);
  });
});
// 27 Sep 2026: a Mediterranean cruise. The ship leaves without you.
describe("portBounds (all aboard)", () => {
  const PORT = { lat: 42.0935, lng: 11.7925 }, COLOSSEUM = { lat: 41.8902, lng: 12.4922 };
  const port = (start: string, end: string | null = null) =>
    card("port", { title: "Civitavècchia Port", sub: "transit", type: "logistics", at: PORT, start_time: start, end_time: end });
  const mid = { first: false, last: false };
  it("an afternoon time on a port day is all aboard: nothing is planned after it", () => {
    const sights = ["a", "b", "c", "d", "e", "f"].map((id) => card(id, { at: COLOSSEUM }));
    const { updates, unplaced } = planExisting([port("16:30"), ...sights], "rest", null, mid);
    expect(updates.length).toBeGreaterThan(0);
    expect(unplaced.length).toBeGreaterThan(0);          // six 90-minute sights do not fit before the ship
    for (const u of updates) expect(u.end_time! <= "16:30").toBe(true);
  });
  it("a window ashore (arrive to all aboard) is the day, not an obstacle", () => {
    const { updates, unplaced } = planExisting([port("08:00", "17:00"), card("col", { at: COLOSSEUM })], "rest", null, mid);
    expect(unplaced).toEqual([]);
    expect(updates[0].start_time! >= "08:00" && updates[0].end_time! <= "17:00").toBe(true);
  });
  it("Re-plan never moves the port's time", () => {
    const { updates } = planExisting([port("16:30"), card("col", { at: COLOSSEUM })], "all", null, mid);
    expect(updates.map((u) => u.id)).toEqual(["col"]);
  });
  it("a short port time is not a window: nothing lands on top of the port", () => {
    const { updates } = planExisting([port("11:45", "13:15"), card("col", { at: COLOSSEUM })], "rest", null, mid);
    expect(updates[0].start_time! >= "13:15").toBe(true);
  });
  it("last day: nothing before you are off the ship", () => {
    const { updates } = planExisting([port("08:00", "10:00"), card("col", { at: COLOSSEUM })], "rest", null, { first: false, last: true });
    expect(updates[0].start_time! >= "10:00").toBe(true);
  });
  it("a train station is not a port and bounds nothing", () => {
    const station = card("st", { title: "Kyoto Station", sub: "transit", type: "logistics", start_time: "16:30" });
    const { updates } = planExisting([station, card("a"), card("b"), card("c"), card("d"), card("e")], "rest", null, mid);
    expect(updates.some((u) => u.start_time! > "16:30")).toBe(true);
  });
});
