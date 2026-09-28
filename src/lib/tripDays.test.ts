import { describe, it, expect } from "vitest";
import { planDayChanges, rehomeDays } from "./tripDays";

// Nashville, as it was: Thursday 16 to Sunday 19 September 2027.
const NASH = [
  { id: "thu", date: "2027-09-16" }, { id: "fri", date: "2027-09-17" },
  { id: "sat", date: "2027-09-18" }, { id: "sun", date: "2027-09-19" },
];

describe("changing a journey's dates", () => {
  it("arriving a day early keeps every plan on its date", () => {
    const c = planDayChanges(NASH, "2027-09-15", "2027-09-19");
    expect(c.remove).toEqual([]);
    expect(c.insert).toEqual([{ date: "2027-09-15", day_number: 1 }]);
    expect(c.update).toEqual([
      { id: "thu", date: "2027-09-16", day_number: 2 }, { id: "fri", date: "2027-09-17", day_number: 3 },
      { id: "sat", date: "2027-09-18", day_number: 4 }, { id: "sun", date: "2027-09-19", day_number: 5 },
    ]);
  });
  it("trimming the first day removes that day, not the last", () => {
    const c = planDayChanges(NASH, "2027-09-17", "2027-09-19");
    expect(c.remove).toEqual(["thu"]);
    expect(c.update.map((u) => [u.id, u.day_number])).toEqual([["fri", 1], ["sat", 2], ["sun", 3]]);
  });
  it("moving the trip to other dates takes the days along in order", () => {
    const c = planDayChanges(NASH, "2027-10-14", "2027-10-17");
    expect(c.remove).toEqual([]);
    expect(c.update.map((u) => [u.id, u.date])).toEqual([["thu", "2027-10-14"], ["fri", "2027-10-15"], ["sat", "2027-10-16"], ["sun", "2027-10-17"]]);
  });
  it("a shorter move drops the last days", () => {
    expect(planDayChanges(NASH, "2027-10-14", "2027-10-15").remove).toEqual(["sat", "sun"]);
  });
});

describe("rehomeDays", () => {
  const kept = [{ id: "k1", date: "2027-07-03" }, { id: "k2", date: "2027-07-04" }, { id: "k3", date: "2027-07-05" }];
  it("days cut off the front go to the new first day, off the end to the new last", () => {
    expect(rehomeDays([{ id: "a", date: "2027-07-01" }, { id: "b", date: "2027-07-02" }, { id: "z", date: "2027-07-09" }], kept))
      .toEqual({ a: "k1", b: "k1", z: "k3" });
  });
  it("nothing kept, nowhere to go", () => {
    expect(rehomeDays([{ id: "a", date: "2027-07-01" }], [])).toEqual({});
  });
});
