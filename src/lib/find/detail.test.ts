import { describe, it, expect } from "vitest";
import { closedOnTrip, priceSigns, placeBlurb } from "./detail";

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

describe("what a place is, in a line", () => {
  it("the travellers' reason first", () => {
    expect(placeBlurb("Reddit's favourite in Trastevere.", "Roman trattoria.")).toBe("Reddit's favourite in Trastevere.");
  });
  it("a Google result's rating is not a description: Google's summary stands in", () => {
    expect(placeBlurb("Rated 4.7 on Google from 12,520 reviews.", "Medieval stone bridge over the Serchio.")).toBe("Medieval stone bridge over the Serchio.");
    expect(placeBlurb("Well rated on Google.", "Medieval stone bridge.")).toBe("Medieval stone bridge.");
  });
  it("an event's line is its own description", () => {
    expect(placeBlurb("Sun 14 Mar: Rock, 8:00 PM.", null)).toBe("Sun 14 Mar: Rock, 8:00 PM.");
  });
  it("neither: nothing, not the rating twice", () => {
    expect(placeBlurb("Rated 4.6 on Google from 900 reviews.", undefined)).toBeNull();
  });
});
