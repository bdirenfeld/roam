import { describe, it, expect } from "vitest";
import { closedOnTrip, priceSigns } from "./detail";

// As Google returns it for a Roman trattoria closed Mondays.
const MONDAYS_OFF = [
  "Monday: Closed",
  "Tuesday: 12:30 – 3:00 PM, 7:30 – 11:00 PM",
  "Wednesday: 12:30 – 3:00 PM, 7:30 – 11:00 PM",
  "Thursday: 12:30 – 3:00 PM, 7:30 – 11:00 PM",
  "Friday: 12:30 – 3:00 PM, 7:30 – 11:00 PM",
  "Saturday: 12:30 – 3:00 PM, 7:30 – 11:00 PM",
  "Sunday: 12:30 – 3:00 PM",
];
const ROME = ["2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28"];

describe("closedOnTrip", () => {
  it("names the journey's own days the place is shut", () => {
    expect(closedOnTrip(MONDAYS_OFF, ROME)).toEqual(["Mon 27 Apr"]);
  });
  it("says nothing when it is open every day you are there, or the hours are unknown", () => {
    expect(closedOnTrip(MONDAYS_OFF, ["2026-04-22", "2026-04-23"])).toEqual([]);
    expect(closedOnTrip(undefined, ROME)).toEqual([]);
    expect(closedOnTrip([], ROME)).toEqual([]);
  });
});

describe("priceSigns", () => {
  it("turns Google's level into dollar signs", () => {
    expect(priceSigns(2)).toBe("$$");
    expect(priceSigns(0)).toBeNull();
    expect(priceSigns(null)).toBeNull();
  });
});
