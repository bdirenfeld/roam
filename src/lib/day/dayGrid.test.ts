import { describe, it, expect } from "vitest";
import { gridSpan, layoutDay, hourLabel, MIN_BLOCK_MIN } from "./dayGrid";

// His New York days as they sit in the database (28 Nov 2026).
const c = (id: string, start: string | null, end: string | null, sub: string | null = null, details: Record<string, unknown> = {}) =>
  ({ id, start_time: start, end_time: end, details, place: { sub_type: sub } });
const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

describe("the phone day as a calendar day (28 Nov 2026)", () => {
  it("New York 23 Jul: the flight runs takeoff to landing, check-in takes 30 min, the two 7:30 ice creams sit side by side", () => {
    const day = [
      c("ac8458", "09:20:00", "10:55:00", "flight_arrival", { departure_time: "09:20", arrival_time: "10:55" }),
      c("howard", "14:00:00", null, "hotel"),
      c("sloomoo", "15:30:00", "17:00:00"),
      c("rubirosa", "18:00:00", "19:30:00"),
      c("figo", "19:30:00", "20:00:00"),
      c("morgenstern", "19:30:00", "20:00:00"),
    ];
    const g = layoutDay(day);
    const by = Object.fromEntries(g.items.map((i) => [i.card.id, i]));
    expect([by.ac8458.start, by.ac8458.end]).toEqual([min("09:20"), min("10:55")]);
    expect(by.howard.end - by.howard.start).toBe(MIN_BLOCK_MIN);
    expect([by.figo.of, by.morgenstern.of, by.figo.col + by.morgenstern.col]).toEqual([2, 2, 1]);
    expect([by.rubirosa.of, by.sloomoo.of]).toEqual([1, 1]);
    expect([g.fromHour, g.toHour]).toEqual([9, 21]);
  });

  it("New York 26 Jul: Strand, Fishs Eddy and Washington Square overlap; John's and Joe's share a pair; the flight home stands alone", () => {
    const day = [
      c("russ", "08:30:00", "09:30:00"),
      c("strand", "10:00:00", "10:45:00"),
      c("fishs", "10:00:00", "11:00:00"),
      c("wsp", "10:50:00", "11:20:00"),
      c("johns", "11:30:00", "12:30:00"),
      c("joes", "11:40:00", "12:10:00"),
      c("ac713", "16:00:00", "17:47:00", "flight_arrival", { departure_time: "4:00" }),
    ];
    const by = Object.fromEntries(layoutDay(day).items.map((i) => [i.card.id, i]));
    expect([by.fishs.of, by.strand.of, by.wsp.of]).toEqual([2, 2, 2]);
    // Washington Square fits under the Strand, beside Fishs Eddy.
    expect(by.wsp.col).toBe(by.strand.col);
    expect(by.wsp.col).not.toBe(by.fishs.col);
    expect([by.johns.of, by.joes.of]).toEqual([2, 2]);
    expect([by.russ.of, by.ac713.of]).toEqual([1, 1]);
    expect([by.ac713.start, by.ac713.end]).toEqual([min("16:00"), min("17:47")]);
  });

  it("Rome AC890, kept on the day it lands (19:45 → 10:20): a block ending at the landing", () => {
    const rome = c("ac890", "19:45:00", "10:20:00", "flight_arrival", { departure_time: "19:45" });
    expect(gridSpan(rome)).toEqual({ start: min("10:20") - MIN_BLOCK_MIN, end: min("10:20") });
  });

  it("a takeoff kept on the day it leaves (Tuscany YYZ 19:00 → 11:30) runs to midnight", () => {
    expect(gridSpan(c("yyz", "19:00:00", "11:30:00", "flight_arrival"))).toEqual({ start: min("19:00"), end: 24 * 60 });
  });

  it("an untimed card stays off the grid; a 10-minute stop still gets a 30-minute block", () => {
    expect(gridSpan(c("idea", null, null))).toBeNull();
    expect(gridSpan(c("coffee", "08:00:00", "08:10:00"))).toEqual({ start: 480, end: 510 });
    expect(layoutDay([c("idea", null, null)]).items).toEqual([]);
  });

  it("a short day still draws three hours; labels read 9 AM, 12 PM, 12 AM", () => {
    const g = layoutDay([c("one", "13:00:00", "13:30:00")]);
    expect([g.fromHour, g.toHour]).toEqual([13, 16]);
    expect([hourLabel(9), hourLabel(12), hourLabel(24), hourLabel(0)]).toEqual(["9 AM", "12 PM", "12 AM", "12 AM"]);
  });
});
