import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import { planPutOnDay, singlePutLine, alreadyLine, batchPutLine } from "./putOnDay";

/**
 * One door onto a day from the journey Map (7 Oct 2026, taps audit): a single
 * pin is timed the way the lasso's pins are. Shapes from the Romania test
 * journey (three days in October, places saved with Find).
 */

const days = [1, 2, 3].map((n) => ({ id: `d${n}`, date: `2026-10-0${4 + n}`, day_number: n }));
const card = (id: string, o: { sub?: string; type?: string; day?: string | null; start?: string | null; end?: string | null; lat?: number; lng?: number; place?: string; details?: unknown } = {}) => ({
  id, trip_id: "t1", day_id: o.day ?? null, status: o.day ? "in_itinerary" : "interested", position: 0,
  details: o.details ?? {}, start_time: o.start ?? null, end_time: o.end ?? null, place_id: o.place ?? "p" + id,
  place: { id: o.place ?? "p" + id, title: id, type: o.type ?? "activity", sub_type: o.sub ?? "self_directed", lat: o.lat ?? 45.6, lng: o.lng ?? 25.6 },
}) as unknown as Card;
const destination = { lat: 45.9, lng: 24.9 };

describe("planPutOnDay — a single pin", () => {
  it("gets a time, planned from the hotel you wake up in", () => {
    const hotel = card("h1", { type: "logistics", sub: "hotel", day: "d1", lat: 45.64, lng: 25.59 });
    const bran = card("c1", { lat: 45.515, lng: 25.367 });
    const { ownDay, batch } = planPutOnDay([bran], days[1], { days, allCards: [hotel, bran], destination, single: true });
    expect(ownDay).toEqual([]);
    expect(batch.toAdd.map((c) => c.id)).toEqual(["c1"]);
    expect(batch.times.get("c1")?.start).toMatch(/^\d\d:\d\d:00$/);
  });

  it("avoids the hours already taken that day", () => {
    const busy = card("b1", { day: "d2", start: "09:00", end: "13:00" });
    const { batch } = planPutOnDay([card("c1")], days[1], { days, allCards: [busy], destination, single: true });
    const start = batch.times.get("c1")!.start;
    expect(start < "09:00" || start >= "13:00").toBe(true);
  });

  it("no free time: still goes on, without a time", () => {
    const allDay = [card("b1", { day: "d2", start: "00:00", end: "12:00" }), card("b2", { day: "d2", start: "12:00", end: "23:59" })];
    const { batch } = planPutOnDay([card("c1")], days[1], { days, allCards: allDay, destination, single: true });
    expect(batch.toAdd.map((c) => c.id)).toEqual(["c1"]);
    expect(batch.times.get("c1")).toBeUndefined();
    expect(batch.unplaced).toEqual(["c1"]);
  });

  it("a hotel goes on at its 3:00 PM check-in, as with the lasso", () => {
    const stay = card("h2", { type: "logistics", sub: "hotel" });
    const { batch } = planPutOnDay([stay], days[1], { days, allCards: [stay], destination, single: true });
    expect(batch.times.get("h2")?.start).toBe("15:00:00");
  });

  it("already planned on another day: it may go on this one too (a second visit)", () => {
    const onDay1 = card("x1", { day: "d1", place: "pc1", start: "10:00", end: "11:00" });
    const saved = card("c1", { place: "pc1" });
    const { batch } = planPutOnDay([saved], days[1], { days, allCards: [onDay1, saved], destination, single: true });
    expect(batch.toAdd.map((c) => c.id)).toEqual(["c1"]);
    expect(batch.elsewhere).toBe(0);
  });

  it("the lasso still skips a place planned on another day", () => {
    const onDay1 = card("x1", { day: "d1", place: "pc1" });
    const saved = card("c1", { place: "pc1" });
    const { batch } = planPutOnDay([saved], days[1], { days, allCards: [onDay1, saved], destination });
    expect(batch.toAdd).toEqual([]);
    expect(batch.elsewhere).toBe(1);
  });

  it("already on THIS day: nothing to add", () => {
    const onDay2 = card("x1", { day: "d2", place: "pc1" });
    const saved = card("c1", { place: "pc1" });
    const { batch } = planPutOnDay([saved], days[1], { days, allCards: [onDay2, saved], destination, single: true });
    expect(batch.toAdd).toEqual([]);
    expect(batch.skipped).toBe(1);
  });

  it("an event on set days moves to its own day, untimed, and is not planned here", () => {
    const fest = card("e1", { sub: "event", details: { find: { why: "Wed 7 Oct: Harvest festival in the old town" } } });
    const { ownDay, batch } = planPutOnDay([fest], days[0], { days, allCards: [fest], destination, single: true });
    expect(ownDay.map((x) => [x.card.id, x.day.id])).toEqual([["e1", "d3"]]);
    expect(ownDay[0].dates).toEqual(["2026-10-07"]);
    expect(batch.toAdd).toEqual([]);
  });
});

describe("the lines", () => {
  it("say the day and the time, or that there was no free time", () => {
    expect(singlePutLine("Tue 6", "15:00")).toBe("Put on Tue 6 · 3:00 PM");
    expect(singlePutLine("Tue 25 Aug", "09:30:00")).toBe("Put on Tue 25 Aug · 9:30 AM");
    expect(singlePutLine("Tue 6", null)).toBe("Put on Tue 6 · no free time");
  });
  it("already there", () => {
    // The day as the rest of the app names it, never "Day 2" (7 Oct 2026, re-audit).
    expect(alreadyLine("Tue 25", false)).toBe("Already on Tue 25");
    expect(alreadyLine("Tue 25", true)).toBe("Already planned on other days");
  });
  it("the lasso's count", () => {
    expect(batchPutLine(3, "Tue 25", 0, 1, 0)).toBe("3 places on Tue 25, in walking order · 1 already there");
    expect(batchPutLine(1, "Tue 25 Aug", 0, 0, 2)).toBe("1 place on Tue 25 Aug, in walking order · 2 already on other days");
    expect(batchPutLine(3, "Tue 25", 1, 0, 0)).toBe("3 on Tue 25; 1 without a time");
  });
});
