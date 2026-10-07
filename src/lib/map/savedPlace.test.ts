import { describe, it, expect } from "vitest";
import { savedCardForPlace, savedPlaceIds } from "./savedPlace";

// 6 Oct 2026, taps audit: a search hit already pinned opens its pin.
const pinned = (id: string, gid: string | null, status = "interested", lat: number | null = 43.84) => ({
  id,
  status,
  place: { google_place_id: gid, lat, lng: 10.5 },
});

describe("savedPlaceIds", () => {
  it("collects the Google ids of pinned places only", () => {
    const ids = savedPlaceIds([pinned("a", "gA"), pinned("b", null), pinned("c", "gC", "interested", null)]);
    expect(Array.from(ids)).toEqual(["gA"]);
  });
});

describe("savedCardForPlace", () => {
  it("returns null when the place is not on the map", () => {
    expect(savedCardForPlace([pinned("a", "gA")], "gZ")).toBeNull();
  });
  it("prefers the scheduled copy over the saved one", () => {
    const cards = [pinned("saved", "gA"), pinned("sched", "gA", "in_itinerary")];
    expect(savedCardForPlace(cards, "gA")?.id).toBe("sched");
  });
  it("falls back to the saved copy", () => {
    expect(savedCardForPlace([pinned("saved", "gA")], "gA")?.id).toBe("saved");
  });
});
