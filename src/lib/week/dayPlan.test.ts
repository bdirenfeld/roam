import { describe, it, expect } from "vitest";
import { planExisting, planBatch, busyOf, anchorOf } from "./dayPlan";
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
