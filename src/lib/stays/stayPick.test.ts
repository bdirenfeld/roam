import { describe, it, expect } from "vitest";
import { tapDay, nightsOf, otherStayNights, selectable } from "./stayPick";
import type { StayRun } from "./stayRuns";

describe("the hotel picker's taps", () => {
  it("first tap is check-in, a later tap is check-out (Villa Zambaldi, 25 Aug → 5 Sept)", () => {
    let p = tapDay({ checkIn: null, checkOut: null }, "2027-08-25");
    expect(p).toEqual({ checkIn: "2027-08-25", checkOut: null });
    p = tapDay(p, "2027-09-05");
    expect(p).toEqual({ checkIn: "2027-08-25", checkOut: "2027-09-05" });
    expect(nightsOf(p)).toBe(11);
  });

  it("a tap before check-in moves check-in; a tap after both are set starts again", () => {
    expect(tapDay({ checkIn: "2027-08-25", checkOut: null }, "2027-08-24")).toEqual({ checkIn: "2027-08-24", checkOut: null });
    expect(tapDay({ checkIn: "2027-08-25", checkOut: "2027-09-05" }, "2027-08-28")).toEqual({ checkIn: "2027-08-28", checkOut: null });
  });

  it("a same-day tap is not a zero-night stay", () => {
    expect(tapDay({ checkIn: "2027-08-25", checkOut: null }, "2027-08-25").checkOut).toBeNull();
  });
});

describe("nights another hotel covers", () => {
  const runs = [
    { cardId: "a", placeId: "ilaria", title: "Hotel Ilaria", checkIn: "2027-08-24", checkOut: "2027-08-25", nights: 1 },
    { cardId: "b", placeId: "villa", title: "Villa Zambaldi", checkIn: "2027-08-25", checkOut: "2027-09-05", nights: 11 },
  ] as StayRun[];

  it("lists the other hotel's nights, never this hotel's own, and not the check-out morning", () => {
    expect(otherStayNights(runs, "villa")).toEqual({ "2027-08-24": "Hotel Ilaria" });
  });

  it("only journey days can be picked; the last day is a fine check-out", () => {
    expect(selectable("2027-09-05", "2027-08-24", "2027-09-05")).toBe(true);
    expect(selectable("2027-08-23", "2027-08-24", "2027-09-05")).toBe(false);
  });
});
