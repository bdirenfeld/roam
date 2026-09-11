import { describe, it, expect } from "vitest";
import { tapFilter, isNarrowed } from "./tapFilter";

const ALL = ["activity", "food", "logistics"];
const set = (...xs: string[]) => new Set(xs);

describe("tapFilter", () => {
  it("narrows to the one tapped, rather than switching it off", () => {
    // His complaint: "if you press food it doesn't just show you everything
    // that's food-related".
    expect(Array.from(tapFilter(set(...ALL), ALL, "food"))).toEqual(["food"]);
  });

  it("adds a second when one is already isolated", () => {
    expect(Array.from(tapFilter(set("food"), ALL, "activity")).sort()).toEqual(["activity", "food"]);
  });

  it("drops one of several", () => {
    expect(Array.from(tapFilter(set("food", "activity"), ALL, "food"))).toEqual(["activity"]);
  });

  it("never leaves an empty map — the last one standing resets to everything", () => {
    expect(Array.from(tapFilter(set("food"), ALL, "food")).sort()).toEqual(Array.from(ALL).sort());
  });

  it("works for the two stay statuses as well as the three types", () => {
    const S = ["interested", "in_itinerary"];
    expect(Array.from(tapFilter(new Set(S), S, "in_itinerary"))).toEqual(["in_itinerary"]);
    expect(Array.from(tapFilter(set("in_itinerary"), S, "in_itinerary")).sort()).toEqual(Array.from(S).sort());
  });
});

describe("isNarrowed", () => {
  it("is true only while the filter is actually hiding something", () => {
    expect(isNarrowed(new Set(ALL), ALL)).toBe(false);
    expect(isNarrowed(set("food"), ALL)).toBe(true);
    expect(isNarrowed(new Set<string>(), ALL)).toBe(false);
  });
});
